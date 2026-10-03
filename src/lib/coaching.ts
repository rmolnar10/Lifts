/**
 * Turns logged history into "what do I change next session".
 *
 * The progression engine in `progression.ts` only raises the load once EVERY
 * set reaches the top of the rep range, so the weakest set is what actually
 * gates progress. Training the first set to failure maximises the gap between
 * the first set and the last, which is exactly the number the engine measures:
 * a lifter can work extremely hard for weeks and never trigger an increase.
 *
 * This module names that situation explicitly rather than leaving the lifter to
 * infer it from a flat chart.
 */

import { reachedTopOfRange, weakestSetIndex } from "./progression";
import { UNTRACKED_TYPES, type Exercise } from "./program";
import { allExercisesIn, type ActiveProgram } from "./activeProgram";
import type { AppState, Workout } from "./types";

/** Sessions at an unchanged load before we call an exercise stalled. */
export const STALL_SESSIONS = 3;

/**
 * How far the first set can exceed the weakest before it reads as
 * "first set taken to failure, later sets paying for it".
 */
export const RAGGED_SET_SPREAD = 2;

export type CoachingStatus =
  | "no-data"
  | "add-load"
  | "stalled"
  | "building"
  | "untracked";

export interface SessionPoint {
  /** ISO date of the workout. */
  date: string;
  weight: number;
  reps: number[];
  /** Load × total reps for this session. */
  volume: number;
}

export interface ExerciseCoaching {
  day: string;
  exercise: Exercise;
  status: CoachingStatus;
  history: SessionPoint[];
  /** Load used in the most recent session. */
  currentLoad: number;
  /** Consecutive most-recent sessions at `currentLoad`. */
  sessionsAtLoad: number;
  /** 1-based index of the set holding progression back, when there is one. */
  blockingSet: number | null;
  /** Reps the blocking set still needs to reach the top of the range. */
  repsShort: number;
  /** First set minus weakest set in the latest session. */
  spread: number;
  /** One-line verdict. */
  headline: string;
  /** What to actually do next session. */
  instruction: string;
}

function volumeOf(weight: number, reps: number[]): number {
  return (weight || 0) * reps.reduce((sum, r) => sum + r, 0);
}

/** Trailing sessions that share the most recent load. */
function sessionsAtCurrentLoad(history: SessionPoint[]): number {
  if (!history.length) return 0;
  const current = history[history.length - 1].weight;
  let count = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].weight !== current) break;
    count += 1;
  }
  return count;
}

function loadLabel(weight: number, exercise: Exercise): string {
  if (exercise.type === "bodyweight" && !weight) return "bodyweight";
  return `${weight} ${exercise.unit}`;
}

export function coachExercise(
  exercise: Exercise,
  day: string,
  workouts: Workout[],
): ExerciseCoaching {
  const history: SessionPoint[] = workouts
    .filter((w) => w.day === day && w.exercises[exercise.id])
    .map((w) => {
      const logged = w.exercises[exercise.id];
      const reps = logged.reps.map(Number);
      return { date: w.date, weight: logged.weight || 0, reps, volume: volumeOf(logged.weight, reps) };
    });

  const base = {
    day,
    exercise,
    history,
    currentLoad: history.length ? history[history.length - 1].weight : 0,
    sessionsAtLoad: sessionsAtCurrentLoad(history),
    blockingSet: null as number | null,
    repsShort: 0,
    spread: 0,
  };

  if (UNTRACKED_TYPES.includes(exercise.type)) {
    return {
      ...base,
      status: "untracked",
      headline: "Not load-tracked",
      instruction: "Progress this by quality and control, not by adding weight.",
    };
  }

  if (!history.length) {
    return {
      ...base,
      status: "no-data",
      headline: "No history yet",
      instruction: `Log a session to start tracking. Aim for ${exercise.min}–${exercise.max} reps per set.`,
    };
  }

  const last = history[history.length - 1];
  const weakest = weakestSetIndex(last.reps);
  const spread = last.reps.length ? last.reps[0] - last.reps[weakest] : 0;

  if (reachedTopOfRange(last.reps, exercise)) {
    const next = last.weight + exercise.inc;
    const startingToLoad = exercise.type === "bodyweight" && !last.weight;
    return {
      ...base,
      spread,
      status: "add-load",
      headline: `Ready for more load — every set hit ${exercise.max}`,
      instruction: startingToLoad
        ? `Start adding external load: ${exercise.inc} ${exercise.unit} next session, and let reps reset toward ${exercise.reset}.`
        : `Go to ${next} ${exercise.unit} next session. Reps will drop back toward ${exercise.reset} — that is expected.`,
    };
  }

  const repsShort = exercise.max - last.reps[weakest];
  const sessionsAtLoad = base.sessionsAtLoad;
  const stalled = sessionsAtLoad >= STALL_SESSIONS;
  const ragged = spread >= RAGGED_SET_SPREAD;

  // The specific, actionable diagnosis: which set is blocking, and whether the
  // cause is a first set taken too close to failure.
  const blocker = `Set ${weakest + 1} is holding this back at ${last.reps[weakest]} reps; it needs ${exercise.max}.`;
  const evenSets = ragged
    ? ` Your first set hit ${last.reps[0]} and your weakest ${last.reps[weakest]}. Hold the early sets back about ${Math.min(spread, 2)} rep${Math.min(spread, 2) === 1 ? "" : "s"} so all ${exercise.sets} land near ${exercise.max}, and take only the last set to failure.`
    : ` Keep the sets even and add one rep to set ${weakest + 1}.`;

  return {
    ...base,
    spread,
    status: stalled ? "stalled" : "building",
    blockingSet: weakest + 1,
    repsShort,
    headline: stalled
      ? `Stalled — ${sessionsAtLoad} sessions at ${loadLabel(last.weight, exercise)}`
      : `Building at ${loadLabel(last.weight, exercise)}`,
    instruction: blocker + evenSets,
  };
}

/** Coaching for every exercise in the active program, in program order. */
export function coachProgram(state: AppState, program: ActiveProgram): ExerciseCoaching[] {
  return allExercisesIn(program).map(({ day, e }) => coachExercise(e, day, state.workouts));
}

/**
 * The exercises worth reading first: anything ready for more load, then
 * anything stalled. Everything else is progressing fine and needs no attention.
 */
export function actionItems(coaching: ExerciseCoaching[]): ExerciseCoaching[] {
  const rank: Record<string, number> = { "add-load": 0, stalled: 1 };
  return coaching
    .filter((c) => c.status === "add-load" || c.status === "stalled")
    .sort((a, b) => {
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      return b.sessionsAtLoad - a.sessionsAtLoad;
    });
}
