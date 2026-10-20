import { describe, expect, it } from "vitest";
import { PROGRAM } from "@/lib/program";
import { suggest } from "@/lib/progression";
import {
  bodyweightNote,
  isStalled,
  maxSetsFor,
  planNext,
  progressed,
  sessionsFor,
  type Session,
} from "@/lib/engine";
import { ATHLETE, tuningFor, type AthleteProfile } from "@/lib/athlete";
import type { LoggedExercise, Readiness, Workout } from "@/lib/types";
import { workout } from "./helpers";

const HEAVY = "Heavy Upper";
const find = (day: string, id: string) => PROGRAM[day].find((e) => e.id === id)!;

const bench = find(HEAVY, "bench"); // primary, 4 x 5-8, +5
const row = find(HEAVY, "crowH"); // isolation, 3 x 8-12, +5
const pull = find(HEAVY, "wpull"); // bodyweight, 3 x 5-10, +2.5

const SURPLUS: AthleteProfile = { experience: "late-novice", energyBalance: "surplus" };

/** A workout with one exercise, optionally marked with readiness. */
function session(
  id: string,
  perf: Partial<LoggedExercise> & { reps: number[] },
  readiness: Readiness | null = null,
): Workout {
  return { ...workout(HEAVY, id, perf), readiness };
}

const plan = (
  id: string,
  history: Workout[],
  ctx: Parameters<typeof planNext>[4] = {},
) => planNext(find(HEAVY, id), HEAVY, history, {}, ctx);

describe("the athlete profile", () => {
  it("is set to Ryan's answers: late novice, eating in a deficit", () => {
    expect(ATHLETE).toEqual({ experience: "late-novice", energyBalance: "deficit" });
  });

  it("waits longer before calling a stall than the old intermediate tuning", () => {
    expect(tuningFor().stallSessions).toBe(4);
    expect(tuningFor({ experience: "intermediate", energyBalance: "deficit" }).stallSessions).toBe(3);
  });

  it("earns sets more slowly and caps them lower in a deficit", () => {
    expect(tuningFor().addSetAfter).toBe(3);
    expect(tuningFor(SURPLUS).addSetAfter).toBe(2);
    expect(maxSetsFor(row)).toBe(4);
    expect(maxSetsFor(row, SURPLUS)).toBe(5);
    expect(maxSetsFor(bench)).toBe(5);
  });
});

describe("falls back to the V5 rule where V6 has nothing to add", () => {
  it("matches the old engine with no history", () => {
    const p = plan("bench", []);
    expect(p.status).toBe("baseline");
    expect(p.target).toBe(suggest(bench, HEAVY, [], {}).target);
    expect(p.sets).toBe(4);
  });

  it("matches the old engine for a plain weakest-set session", () => {
    const history = [session("bench", { reps: [8, 7, 6, 6], weight: 135, rir: 2 })];
    const p = plan("bench", history);
    expect(p.status).toBe("building");
    expect(p.target).toBe(suggest(bench, HEAVY, history, {}).target);
    expect(p.focus).toBe(suggest(bench, HEAVY, history, {}).focus);
  });

  it("leaves untracked movements alone", () => {
    const hold = find("Daily Hips (Mobility)", "hkhip");
    const p = planNext(hold, "Daily Hips (Mobility)", [], {});
    expect(p.status).toBe("untracked");
  });
});

describe("rule 1: a rough day", () => {
  it("holds last session's numbers instead of adding load", () => {
    const history = [session("bench", { reps: [8, 8, 8, 8], weight: 135, rir: 1 })];
    const p = plan("bench", history, { readinessToday: "rough" });
    expect(p.status).toBe("rough-day");
    expect(p.weight).toBe(135);
    expect(p.target).toBe("135 lb × 8 / 8 / 8 / 8");
  });

  it("drops any added sets for the day", () => {
    const history = [session("bench", { reps: [7, 7, 6, 6, 6], weight: 135, rir: 1 })];
    const p = plan("bench", history, { readinessToday: "rough" });
    expect(p.sets).toBe(4);
  });

  it("does not count against a lift when judging a stall", () => {
    // Five flat sessions, but two were rough days: only three count.
    const history = [
      session("crowH", { reps: [12, 11, 10], weight: 90 }),
      session("crowH", { reps: [12, 11, 10], weight: 90 }, "rough"),
      session("crowH", { reps: [12, 11, 10], weight: 90 }),
      session("crowH", { reps: [12, 11, 10], weight: 90 }, "rough"),
      session("crowH", { reps: [12, 11, 10], weight: 90 }),
    ];
    expect(plan("crowH", history).status).toBe("building");
  });
});

describe("rule 2: form", () => {
  it("will not add load on reps where form broke down", () => {
    const history = [session("bench", { reps: [8, 8, 8, 8], weight: 135, formOk: false })];
    const p = plan("bench", history);
    expect(p.status).toBe("fix-form");
    expect(p.weight).toBe(135);
    expect(p.focus).toContain("every rep clean");
  });

  it("drops one step when form breaks twice running at the same load", () => {
    const history = [
      session("bench", { reps: [7, 7, 6, 6], weight: 135, formOk: false }),
      session("bench", { reps: [7, 7, 6, 6], weight: 135, formOk: false }),
    ];
    const p = plan("bench", history);
    expect(p.status).toBe("form-backoff");
    expect(p.weight).toBe(130);
  });

  it("treats unrecorded form as fine, so old history behaves as before", () => {
    const history = [session("bench", { reps: [8, 8, 8, 8], weight: 135 })];
    expect(plan("bench", history).status).toBe("add-load");
  });
});

describe("rule 3: adding load", () => {
  it("adds one step normally", () => {
    const history = [session("bench", { reps: [8, 8, 8, 8], weight: 135, rir: 1 })];
    const p = plan("bench", history);
    expect(p.status).toBe("add-load");
    expect(p.weight).toBe(140);
    expect(p.target).toBe("140 lb × 5–8");
  });

  it("jumps two steps when the last set had 3+ reps in reserve", () => {
    const history = [session("bench", { reps: [8, 8, 8, 8], weight: 135, rir: 3 })];
    const p = plan("bench", history);
    expect(p.weight).toBe(145);
    expect(p.focus).toContain("jump two steps");
  });

  it("goes back to the program's set count after an increase", () => {
    const history = [session("bench", { reps: [8, 8, 8, 8, 8], weight: 135, rir: 1 })];
    const p = plan("bench", history);
    expect(p.sets).toBe(4);
    expect(p.focus).toContain("Go back to 4 sets");
  });

  it("starts a bodyweight pull-up on the smallest plate, never a double jump", () => {
    const history = [session("wpull", { reps: [10, 10, 10], weight: 0, rir: 4 })];
    const p = planNext(pull, HEAVY, history, {});
    expect(p.weight).toBe(2.5);
  });
});

describe("rule 4: a stall", () => {
  const flat = (n: number) =>
    Array.from({ length: n }, () => session("crowH", { reps: [12, 11, 10], weight: 90, rir: 1 }));

  it("needs four flat sessions for a late novice", () => {
    expect(plan("crowH", flat(3)).status).toBe("building");
    expect(plan("crowH", flat(4)).status).toBe("stalled");
  });

  it("is not a stall while reps are still climbing, however slowly", () => {
    const history = [
      session("crowH", { reps: [12, 11, 10], weight: 90 }),
      session("crowH", { reps: [12, 11, 10], weight: 90 }),
      session("crowH", { reps: [12, 11, 11], weight: 90 }),
      session("crowH", { reps: [12, 11, 11], weight: 90 }),
    ];
    expect(plan("crowH", history).status).not.toBe("stalled");
  });

  it("holds the load in a deficit rather than cutting it", () => {
    const p = plan("crowH", flat(4));
    expect(p.weight).toBe(90);
    expect(p.focus).toContain("the load holds");
  });

  it("sheds an added set in a deficit", () => {
    const history = Array.from({ length: 4 }, () =>
      session("crowH", { reps: [12, 11, 10, 9], weight: 90, rir: 1 }),
    );
    const p = plan("crowH", history);
    expect(p.sets).toBe(3);
    expect(p.focus).toContain("Drop back to 3 sets");
  });

  it("backs off about 10% when eating enough", () => {
    const p = plan("crowH", flat(4), { athlete: SURPLUS });
    expect(p.status).toBe("stalled");
    expect(p.weight).toBe(80);
  });

  it("reads bodyweight alongside the stall", () => {
    const p = plan("crowH", flat(4), {
      bodyweight: [
        { date: "2026-01-01", weight: 190 },
        { date: "2026-01-29", weight: 182 },
      ],
    });
    expect(p.note).toContain("faster than the 0.5–1% a week");
  });
});

describe("rule 5: set-count progression", () => {
  const climbing = [
    session("crowH", { reps: [10, 9, 8], weight: 90, rir: 2 }),
    session("crowH", { reps: [10, 9, 9], weight: 90, rir: 2 }),
    session("crowH", { reps: [10, 10, 9], weight: 90, rir: 2 }),
    session("crowH", { reps: [11, 10, 9], weight: 90, rir: 2 }),
  ];

  it("adds a set after three sessions of progress in a deficit", () => {
    const p = plan("crowH", climbing);
    expect(p.status).toBe("add-set");
    expect(p.sets).toBe(4);
    expect(p.target).toBe("90 lb × 11 / 10 / 9 / 8");
  });

  it("needs only two in a surplus", () => {
    expect(plan("crowH", climbing.slice(0, 3), { athlete: SURPLUS }).status).toBe("add-set");
    expect(plan("crowH", climbing.slice(0, 3)).status).toBe("building");
  });

  it("does not add a set while grinding at 0 RIR", () => {
    const grinding = climbing.map((w) => ({
      ...w,
      exercises: { crowH: { ...w.exercises.crowH, rir: 0 } },
    }));
    expect(plan("crowH", grinding).status).toBe("building");
  });

  it("stops at the cap", () => {
    const capped = [
      session("crowH", { reps: [10, 9, 8, 8], weight: 90, rir: 2 }),
      session("crowH", { reps: [10, 9, 9, 8], weight: 90, rir: 2 }),
      session("crowH", { reps: [10, 10, 9, 8], weight: 90, rir: 2 }),
      session("crowH", { reps: [11, 10, 9, 8], weight: 90, rir: 2 }),
    ];
    const p = plan("crowH", capped);
    expect(p.status).toBe("building");
    expect(p.sets).toBe(4);
  });

  it("counts a new set without lost reps as progress", () => {
    const a: Session = { date: "", weight: 90, reps: [11, 10, 9], rir: 2, formOk: null, readiness: null };
    expect(progressed(a, { ...a, reps: [11, 10, 9, 8] })).toBe(true);
    expect(progressed(a, { ...a, reps: [11, 9, 9, 8] })).toBe(false);
    expect(progressed(a, { ...a, weight: 95, reps: [8, 8, 8] })).toBe(true);
  });
});

describe("rule 6: building", () => {
  it("adds a rep to every short set when the last one had plenty in reserve", () => {
    const history = [session("bench", { reps: [7, 6, 6, 5], weight: 135, rir: 3 })];
    const p = plan("bench", history);
    expect(p.target).toBe("135 lb × 8 / 7 / 7 / 6");
  });

  it("keeps working at an added set count", () => {
    const history = [session("bench", { reps: [7, 7, 6, 6, 5], weight: 135, rir: 1 })];
    const p = plan("bench", history);
    expect(p.sets).toBe(5);
    expect(p.target).toBe("135 lb × 7 / 7 / 6 / 6 / 6");
  });
});

describe("helpers", () => {
  it("reads readiness and form out of saved workouts", () => {
    const s = sessionsFor(bench, HEAVY, [
      session("bench", { reps: [8], weight: 135, formOk: false }, "good"),
    ]);
    expect(s[0]).toMatchObject({ formOk: false, readiness: "good" });
  });

  it("isStalled ignores rough days entirely", () => {
    const s = (readiness: Readiness | null): Session => ({
      date: "", weight: 90, reps: [12, 11, 10], rir: 1, formOk: null, readiness,
    });
    expect(isStalled([s(null), s(null), s(null), s("rough")])).toBe(false);
    expect(isStalled([s(null), s(null), s(null), s(null)])).toBe(true);
  });

  it("bodyweightNote asks for data before it has any", () => {
    expect(bodyweightNote([])).toContain("Log your bodyweight weekly");
  });

  it("bodyweightNote calls a steady cut a steady cut", () => {
    const note = bodyweightNote([
      { date: "2026-01-01", weight: 190 },
      { date: "2026-01-29", weight: 187 },
    ]);
    expect(note).toContain("steady cut");
  });

  it("bodyweightNote says a flat bodyweight points away from the deficit", () => {
    const note = bodyweightNote([
      { date: "2026-01-01", weight: 185 },
      { date: "2026-01-29", weight: 185.2 },
    ]);
    expect(note).toContain("less likely to be the deficit");
  });
});
