import { describe, expect, it } from "vitest";
import { PROGRAM } from "@/lib/program";
import {
  actionItems,
  coachExercise,
  RAGGED_SET_SPREAD,
  STALL_SESSIONS,
} from "@/lib/coaching";
import { DELOAD_EVERY_N_WORKOUTS, deloadStatus } from "@/lib/deload";
import { workout } from "./helpers";

const HEAVY = "Heavy Upper";
const VOLUME = "Volume Upper";

const find = (day: string, id: string) => PROGRAM[day].find((e) => e.id === id)!;

describe("coaching: when to add load", () => {
  it("says add load once every set reaches the top of the range", () => {
    const shoulder = find(HEAVY, "shoulder"); // 3 x 6-10, +5 lb
    const history = [workout(HEAVY, "shoulder", { reps: [10, 10, 10], weight: 40 })];
    const c = coachExercise(shoulder, HEAVY, history);

    expect(c.status).toBe("add-load");
    expect(c.instruction).toContain("45");
  });

  it("tells a bodyweight lift to start adding plates rather than 'increase load'", () => {
    const pull = find(HEAVY, "wpull"); // bodyweight, 4 x 5-10
    const history = [workout(HEAVY, "wpull", { reps: [10, 10, 10, 10], weight: 0 })];
    const c = coachExercise(pull, HEAVY, history);

    expect(c.status).toBe("add-load");
    expect(c.instruction).toContain("Start adding external load");
    expect(c.instruction).not.toContain("0 lb");
  });
});

describe("coaching: diagnosing a stall", () => {
  // The real pattern from the logged history: cable row stuck at 90 lb for five
  // sessions because the third set never reaches 12.
  const stalledRow = () =>
    Array.from({ length: 5 }, () =>
      workout(HEAVY, "crowH", { reps: [12, 11, 10], weight: 90 }),
    );

  it("flags an exercise that has not moved for several sessions", () => {
    const c = coachExercise(find(HEAVY, "crowH"), HEAVY, stalledRow());

    expect(c.status).toBe("stalled");
    expect(c.sessionsAtLoad).toBe(5);
    expect(c.currentLoad).toBe(90);
  });

  it("names the set that is blocking progression and the gap", () => {
    const c = coachExercise(find(HEAVY, "crowH"), HEAVY, stalledRow());

    expect(c.blockingSet).toBe(3);
    expect(c.repsShort).toBe(2);
    expect(c.instruction).toContain("Set 3");
    expect(c.instruction).toContain("needs 12");
  });

  it("calls out a ragged first set as the cause", () => {
    const c = coachExercise(find(HEAVY, "crowH"), HEAVY, stalledRow());

    expect(c.spread).toBe(2);
    expect(c.instruction).toContain("take only the last set to failure");
  });

  it("does not blame the first set when the sets are already even", () => {
    const history = Array.from({ length: 4 }, () =>
      workout(HEAVY, "crowH", { reps: [11, 11, 11], weight: 90 }),
    );
    const c = coachExercise(find(HEAVY, "crowH"), HEAVY, history);

    expect(c.spread).toBeLessThan(RAGGED_SET_SPREAD);
    expect(c.instruction).toContain("add one rep to set 1");
    expect(c.instruction).not.toContain("Hold the early sets back");
  });

  it("is still 'building' before the stall threshold", () => {
    const history = Array.from({ length: STALL_SESSIONS - 1 }, () =>
      workout(VOLUME, "latV", { reps: [15, 15, 12], weight: 15 }),
    );
    expect(coachExercise(find(VOLUME, "latV"), VOLUME, history).status).toBe("building");
  });

  it("counts only the trailing sessions at the current load", () => {
    const history = [
      workout(HEAVY, "crowH", { reps: [12, 11, 10], weight: 85 }),
      workout(HEAVY, "crowH", { reps: [12, 11, 10], weight: 90 }),
      workout(HEAVY, "crowH", { reps: [12, 11, 10], weight: 90 }),
    ];
    expect(coachExercise(find(HEAVY, "crowH"), HEAVY, history).sessionsAtLoad).toBe(2);
  });

  it("has nothing to say about an exercise with no history", () => {
    expect(coachExercise(find(HEAVY, "bench"), HEAVY, []).status).toBe("no-data");
  });

  it("does not try to load-progress a timed or practice movement", () => {
    const plank = find("Legs + Abs", "sideplank");
    const history = [workout("Legs + Abs", "sideplank", { reps: [60, 60], weight: 0 })];
    expect(coachExercise(plank, "Legs + Abs", history).status).toBe("untracked");
  });
});

describe("coaching: the action list", () => {
  it("puts ready-to-progress lifts above stalled ones, worst stall first", () => {
    const items = actionItems([
      { status: "stalled", sessionsAtLoad: 3 },
      { status: "building", sessionsAtLoad: 1 },
      { status: "stalled", sessionsAtLoad: 6 },
      { status: "add-load", sessionsAtLoad: 2 },
      { status: "no-data", sessionsAtLoad: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    expect(items.map((i) => [i.status, i.sessionsAtLoad])).toEqual([
      ["add-load", 2],
      ["stalled", 6],
      ["stalled", 3],
    ]);
  });
});

describe("deload reminder", () => {
  const sessions = (n: number) =>
    Array.from({ length: n }, () => workout(HEAVY, "bench", { reps: [8], weight: 135 }));

  it("is not due before the interval is reached", () => {
    const status = deloadStatus(sessions(DELOAD_EVERY_N_WORKOUTS - 1));
    expect(status.due).toBe(false);
    expect(status.remaining).toBe(1);
  });

  it("comes due on the interval", () => {
    const status = deloadStatus(sessions(DELOAD_EVERY_N_WORKOUTS));
    expect(status.due).toBe(true);
    expect(status.message).toContain("Deload this session");
    expect(status.message).toContain("3–4 RIR");
  });

  it("comes due again a full interval later, not every session after", () => {
    expect(deloadStatus(sessions(DELOAD_EVERY_N_WORKOUTS + 1)).due).toBe(false);
    expect(deloadStatus(sessions(DELOAD_EVERY_N_WORKOUTS * 2)).due).toBe(true);
  });

  it("is never due before the first workout", () => {
    expect(deloadStatus([]).due).toBe(false);
  });

  it("honours a custom interval", () => {
    expect(deloadStatus(sessions(21), 21).due).toBe(true);
    expect(deloadStatus(sessions(7), 21).due).toBe(false);
    expect(deloadStatus(sessions(7), 21).remaining).toBe(14);
  });
});
