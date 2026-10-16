/**
 * V6 progression engine: what to do next session, and why.
 *
 * Builds on the V4/V5 rule in `progression.ts` (which stays as it was, pinned by
 * the parity harness) and adds the signals that rule ignored:
 *
 *   - readiness at the start of a session (rough / normal / good)
 *   - whether form held on every rep
 *   - reps in reserve on the final set
 *   - bodyweight trend, to tell a recovery stall from a load problem
 *   - set count, which can now grow on top of the program's own
 *
 * The rules run as a cascade, first match wins:
 *
 *   1. Rough day today      → repeat last session, no increases.
 *   2. Form broke down      → repeat the load until it is clean; twice running at
 *                             the same load, drop one step.
 *   3. Top of the range     → add load (two steps if the last set had plenty in
 *                             reserve), and go back to the program's set count.
 *   4. Stalled              → in a deficit, hold the load and shed any extra set;
 *                             otherwise back off about 10% and rebuild.
 *   5. Progressing steadily → add a set.
 *   6. Otherwise            → add a rep to the weakest set (every short set when
 *                             the last one had plenty in reserve).
 *
 * Sessions marked rough are not held against a lift: they neither count toward
 * a stall nor break a run of progress.
 */

import { UNTRACKED_TYPES, type Exercise } from "./program";
import { suggest } from "./progression";
import { ATHLETE, tuningFor, type AthleteProfile } from "./athlete";
import type { BodyweightEntry, Readiness, StartingWeights, Workout } from "./types";

export type PlanStatus =
  | "baseline"
  | "untracked"
  | "rough-day"
  | "fix-form"
  | "form-backoff"
  | "add-load"
  | "add-set"
  | "stalled"
  | "building";

export interface NextPlan {
  /** Headline target, e.g. `135 lb × 8 / 8 / 7 / 7`. */
  target: string;
  /** What to focus on, and why. */
  focus: string;
  /** Weight to pre-fill ("" when the exercise takes no load). */
  weight: number | "";
  /** Working sets to do next session. */
  sets: number;
  status: PlanStatus;
  /** Context worth reading alongside the target, e.g. what bodyweight says. */
  note: string | null;
}

export interface EngineContext {
  athlete?: AthleteProfile;
  /** Readiness tapped at the start of the session being planned. */
  readinessToday?: Readiness | null;
  bodyweight?: BodyweightEntry[];
}

/** One logged performance of one exercise. */
export interface Session {
  date: string;
  weight: number;
  reps: number[];
  rir: number | null;
  formOk: boolean | null;
  readiness: Readiness | null;
}

const LOAD_TYPES: Exercise["type"][] = ["primary", "isolation", "bodyweight"];

/** Every logged performance of `exercise` on `day`, oldest first. */
export function sessionsFor(exercise: Exercise, day: string, workouts: Workout[]): Session[] {
  return workouts
    .filter((w) => w.day === day && w.exercises[exercise.id])
    .map((w) => {
      const x = w.exercises[exercise.id];
      return {
        date: w.date,
        weight: Number(x.weight) || 0,
        reps: x.reps.map(Number),
        rir: x.rir ?? null,
        formOk: x.formOk ?? null,
        readiness: w.readiness ?? null,
      };
    });
}

/** Most sets this exercise may grow to. */
export function maxSetsFor(exercise: Exercise, athlete: AthleteProfile = ATHLETE): number {
  if (!LOAD_TYPES.includes(exercise.type)) return exercise.sets;
  const t = tuningFor(athlete);
  const extra = exercise.type === "primary" ? t.extraSetsPrimary : t.extraSetsAccessory;
  return Math.min(6, exercise.sets + extra);
}

/** The set count the last session was working at, within the allowed range. */
export function currentSetCount(
  exercise: Exercise,
  last: Session | undefined,
  athlete: AthleteProfile = ATHLETE,
): number {
  if (!last) return exercise.sets;
  return Math.min(maxSetsFor(exercise, athlete), Math.max(exercise.sets, last.reps.length));
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Did `cur` beat `prev`? More load, or the same load with more reps across the
 * sets both sessions did, or an added set without losing reps on the others.
 */
export function progressed(prev: Session, cur: Session): boolean {
  if (cur.weight !== prev.weight) return cur.weight > prev.weight;
  const k = Math.min(prev.reps.length, cur.reps.length);
  const before = sum(prev.reps.slice(0, k));
  const after = sum(cur.reps.slice(0, k));
  if (after > before) return true;
  return cur.reps.length > prev.reps.length && after >= before;
}

/** Sessions that count when judging progress: rough days are excused. */
const counted = (sessions: Session[]) => sessions.filter((s) => s.readiness !== "rough");

/** Trailing counted sessions at the most recent load. */
export function runAtCurrentLoad(sessions: Session[]): Session[] {
  const list = counted(sessions);
  if (!list.length) return [];
  const load = list[list.length - 1].weight;
  const run: Session[] = [];
  for (let i = list.length - 1; i >= 0 && list[i].weight === load; i -= 1) run.unshift(list[i]);
  return run;
}

/** Stalled: enough sessions at one load, and no rep gained across them. */
export function isStalled(sessions: Session[], athlete: AthleteProfile = ATHLETE): boolean {
  const run = runAtCurrentLoad(sessions);
  const { stallSessions } = tuningFor(athlete);
  if (run.length < stallSessions) return false;
  const window = run.slice(-stallSessions);
  return !window.slice(1).some((s) => progressed(window[0], s));
}

/** Consecutive progressing sessions at the current load, ending with the last. */
export function progressStreak(sessions: Session[]): number {
  const run = runAtCurrentLoad(sessions);
  let streak = 0;
  for (let i = run.length - 1; i > 0; i -= 1) {
    if (!progressed(run[i - 1], run[i])) break;
    streak += 1;
  }
  return streak;
}

/** All sets the lifter did reached the top, and there were at least enough of them. */
function toppedOut(exercise: Exercise, reps: number[]): boolean {
  return reps.length >= exercise.sets && reps.every((r) => r >= exercise.max);
}

function formatLoad(weight: number, exercise: Exercise): string {
  if (exercise.type === "bodyweight" && !weight) return "Bodyweight";
  return `${weight} ${exercise.unit}`;
}

/** Last session's reps resized to `sets`, new sets aiming at the bottom of the range. */
function repsAt(reps: number[], sets: number, exercise: Exercise): number[] {
  return Array.from({ length: sets }, (_, i) => reps[i] ?? exercise.min);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What bodyweight says about a stall. Rate is measured over roughly the last
 * four weeks, and only once there are two readings at least ten days apart.
 */
export function bodyweightNote(
  entries: BodyweightEntry[] | undefined,
  athlete: AthleteProfile = ATHLETE,
): string | null {
  const list = [...(entries ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  if (list.length < 2) {
    return athlete.energyBalance === "deficit"
      ? "Log your bodyweight weekly so the app can tell a recovery stall from a load problem."
      : null;
  }
  const last = list[list.length - 1];
  const dayMs = 86_400_000;
  const lastTime = Date.parse(last.date);
  const from =
    [...list].reverse().find((e) => lastTime - Date.parse(e.date) >= 28 * dayMs) ?? list[0];
  const days = (lastTime - Date.parse(from.date)) / dayMs;
  if (days < 10) return null;

  const perWeek = ((last.weight - from.weight) / days) * 7;
  const pct = (perWeek / from.weight) * 100;
  const rate = `${Math.abs(perWeek).toFixed(1)} lb a week`;

  if (pct <= -1) {
    return `Bodyweight is dropping ${rate} (${Math.abs(pct).toFixed(1)}%), faster than the 0.5–1% a week that protects muscle. Eat a little more before changing the training.`;
  }
  if (pct < -0.25) {
    return `Bodyweight is down ${rate}, a steady cut. Slower progress is expected; keep protein high.`;
  }
  if (athlete.energyBalance === "deficit") {
    return `Bodyweight has held steady over ${Math.round(days / 7)} weeks, so this stall is less likely to be the deficit. Check sleep and how hard the sets really are.`;
  }
  return null;
}

/** Plans the next session of one exercise. */
export function planNext(
  exercise: Exercise,
  day: string,
  workouts: Workout[],
  starts: StartingWeights,
  ctx: EngineContext = {},
): NextPlan {
  const athlete = ctx.athlete ?? ATHLETE;
  const tuning = tuningFor(athlete);
  const base = suggest(exercise, day, workouts, starts);
  const sessions = sessionsFor(exercise, day, workouts);
  const last = sessions[sessions.length - 1];

  if (UNTRACKED_TYPES.includes(exercise.type) || !LOAD_TYPES.includes(exercise.type)) {
    return { ...base, sets: exercise.sets, status: "untracked", note: null };
  }
  if (!last) {
    return { ...base, sets: exercise.sets, status: "baseline", note: null };
  }

  const sets = currentSetCount(exercise, last, athlete);
  const load = formatLoad(last.weight, exercise);
  const same = (s: number) => `${load} × ${repsAt(last.reps, s, exercise).join(" / ")}`;

  // 1. A rough day is for showing up, not for testing anything.
  if (ctx.readinessToday === "rough") {
    return {
      target: same(exercise.sets),
      focus: `Rough day: match last session at ${load}, no increases, and stop each set at 2–3 RIR.${sets > exercise.sets ? ` Skip the extra set${sets - exercise.sets === 1 ? "" : "s"} today.` : ""}`,
      weight: last.weight,
      sets: exercise.sets,
      status: "rough-day",
      note: null,
    };
  }

  // 2. Reps with broken form are not progress, so they cannot earn more load.
  if (last.formOk === false) {
    const prev = sessions[sessions.length - 2];
    const twice = prev && prev.formOk === false && prev.weight === last.weight;
    const canDrop = last.weight - exercise.inc >= 0 && last.weight > 0;
    if (twice && canDrop) {
      const lighter = last.weight - exercise.inc;
      return {
        target: `${formatLoad(lighter, exercise)} × ${exercise.reset}–${exercise.max}`,
        focus: `Form broke down two sessions running at ${load}. Drop to ${formatLoad(lighter, exercise)} and own every rep; the load comes back once the reps are clean.`,
        weight: lighter,
        sets: exercise.sets,
        status: "form-backoff",
        note: null,
      };
    }
    return {
      target: same(sets),
      focus: "Form broke down last time. Repeat these numbers with every rep clean before adding anything.",
      weight: last.weight,
      sets,
      status: "fix-form",
      note: null,
    };
  }

  // 3. Every set at the top of the range: more load, back to the program's sets.
  if (toppedOut(exercise, last.reps)) {
    const startingToLoad = exercise.type === "bodyweight" && !last.weight;
    const double =
      !startingToLoad && last.rir !== null && last.rir >= tuning.doubleJumpRir;
    const next = last.weight + exercise.inc * (double ? 2 : 1);
    const parts = [
      startingToLoad
        ? `All sets reached ${exercise.max}. Start adding external load.`
        : `All sets reached ${exercise.max}. Increase load.`,
    ];
    if (double) parts.push(`You had ${last.rir} reps in reserve, so jump two steps.`);
    if (sets > exercise.sets) parts.push(`Go back to ${exercise.sets} sets while the new load settles.`);
    return {
      target: `${formatLoad(next, exercise)} × ${exercise.reset}–${exercise.max}`,
      focus: parts.join(" "),
      weight: next,
      sets: exercise.sets,
      status: "add-load",
      note: null,
    };
  }

  const weakest = last.reps.indexOf(Math.min(...last.reps));

  // 4. Stalled. In a deficit the usual cause is food and recovery, so the load
  // holds; cutting it would chase the lifter's numbers down for no reason.
  if (isStalled(sessions, athlete)) {
    const run = runAtCurrentLoad(sessions).length;
    if (athlete.energyBalance === "deficit") {
      const shed = sets > exercise.sets;
      const targetReps = repsAt(last.reps, exercise.sets, exercise);
      const w = Math.min(weakest, exercise.sets - 1);
      targetReps[w] = Math.min(exercise.max, targetReps[w] + 1);
      return {
        target: `${load} × ${targetReps.join(" / ")}`,
        focus: `${plural(run, "session")} at ${load} without gaining a rep. In a deficit that is usually recovery, not the load, so the load holds.${shed ? ` Drop back to ${exercise.sets} sets to recover.` : ""} Keep the early sets about a rep short of failure and chase one more rep on set ${w + 1}.`,
        weight: last.weight,
        sets: exercise.sets,
        status: "stalled",
        note: bodyweightNote(ctx.bodyweight, athlete),
      };
    }
    const backedOff = Math.max(
      exercise.inc,
      Math.round((last.weight * 0.9) / (exercise.inc || 1)) * (exercise.inc || 1),
    );
    return {
      target: `${formatLoad(backedOff, exercise)} × ${exercise.reset}–${exercise.max}`,
      focus: `${plural(run, "session")} at ${load} without gaining a rep. Back off about 10% and build the reps back up.`,
      weight: backedOff,
      sets: exercise.sets,
      status: "stalled",
      note: null,
    };
  }

  // 5. Progressing steadily, with form and effort in check: earn a set.
  const streak = progressStreak(sessions);
  const roomForSet = sets < maxSetsFor(exercise, athlete);
  const notGrinding = last.rir === null || last.rir >= 1;
  if (roomForSet && notGrinding && streak >= tuning.addSetAfter) {
    const next = sets + 1;
    return {
      target: same(next),
      focus: `${plural(streak, "session")} of progress in a row at ${load}. Add a set: set ${next} aims for ${exercise.min}–${exercise.max}, the others hold.`,
      weight: last.weight,
      sets: next,
      status: "add-set",
      note: null,
    };
  }

  // 6. Building: one clean rep on the weakest set, or on every short set when
  // the last one was well short of failure.
  const targetReps = repsAt(last.reps, sets, exercise);
  const plenty = last.rir !== null && last.rir >= tuning.doubleJumpRir;
  let focus: string;
  if (plenty) {
    targetReps.forEach((r, i) => {
      targetReps[i] = Math.min(exercise.max, r + 1);
    });
    focus = `You had ${last.rir} reps in reserve. Add a rep to every set.`;
  } else {
    targetReps[weakest] = Math.min(exercise.max, targetReps[weakest] + 1);
    focus = `Prioritize Set ${weakest + 1}; add one clean rep.`;
  }
  return {
    target: `${load} × ${targetReps.join(" / ")}`,
    focus,
    weight: last.weight,
    sets,
    status: "building",
    note: null,
  };
}
