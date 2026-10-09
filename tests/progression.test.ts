import { describe, expect, it } from "vitest";
import { PROGRAM, UNTRACKED_TYPES, findExercise, startKey, type Exercise } from "@/lib/program";
import { suggest } from "@/lib/progression";
import type { Workout } from "@/lib/types";
import { exerciseById, repsFromTarget, workout } from "./helpers";

const HEAVY = "Heavy Upper";
const VOLUME = "Volume Upper";
const FUNC = "Functional Lower";
const PELVIC = "Pelvic Floor";
const CARDIO = "Cardio";

const bench = exerciseById(PROGRAM[HEAVY], "bench");
const row = exerciseById(PROGRAM[HEAVY], "crowH");
// Squat left the program when lower-body hypertrophy was deprioritised, but
// the V4 spec's worked example is still the clearest statement of the rule, so
// the exercise is declared here rather than read from PROGRAM.
const squat: Exercise = {
  id: "squat", name: "Squat", sets: 3, min: 5, max: 8,
  type: "primary", unit: "lb", inc: 5, reset: 5, rest: 180,
};

describe("baseline (no history)", () => {
  it("asks for a starting weight when none is set", () => {
    const s = suggest(bench, HEAVY, [], {});
    expect(s.target).toBe("Enter starting lb");
    expect(s.focus).toContain("Establish a baseline");
    expect(s.weight).toBe("");
  });

  it("uses the configured starting weight and the full rep range", () => {
    const s = suggest(bench, HEAVY, [], { [startKey(HEAVY, "bench")]: 135 });
    expect(s.target).toBe("135 lb × 5–8");
    expect(s.weight).toBe(135);
  });
});

describe("weakest-set progression", () => {
  it("adds one rep to the weakest set", () => {
    // 8/7/6/6 -> the weakest set is the first 6, i.e. set 3.
    const history = [workout(HEAVY, "bench", { reps: [8, 7, 6, 6], weight: 135 })];
    const s = suggest(bench, HEAVY, history, {});
    expect(s.target).toBe("135 lb × 8 / 7 / 7 / 6");
    expect(s.focus).toBe("Prioritize Set 3; add one clean rep.");
  });

  it("targets the first of several equally weak sets", () => {
    const history = [workout(HEAVY, "bench", { reps: [8, 6, 6, 6], weight: 135 })];
    expect(suggest(bench, HEAVY, history, {}).focus).toBe(
      "Prioritize Set 2; add one clean rep.",
    );
  });

  it("walks 8/7/6/6 up to 8/8/8/8 and only then increases load", () => {
    let reps = [8, 7, 6, 6];
    const seen: string[] = [];

    for (let step = 0; step < 12; step += 1) {
      const history: Workout[] = [workout(HEAVY, "bench", { reps, weight: 135 })];
      const s = suggest(bench, HEAVY, history, {});
      seen.push(s.target);
      const next = repsFromTarget(s.target);
      if (!next || next.length !== reps.length) break; // load increased
      reps = next;
    }

    expect(reps).toEqual([8, 8, 8, 8]);
    expect(seen.at(-1)).toBe("140 lb × 5–8");
  });

  it("increases load once every set reaches the top of the range", () => {
    const history = [workout(HEAVY, "bench", { reps: [8, 8, 8, 8], weight: 135 })];
    const s = suggest(bench, HEAVY, history, {});
    expect(s.target).toBe("140 lb × 5–8");
    expect(s.focus).toBe("All sets reached 8. Increase load.");
    expect(s.weight).toBe(140);
  });

  it("resets the target toward the bottom of the range after a load increase", () => {
    const history = [workout(HEAVY, "bench", { reps: [8, 8, 8, 8], weight: 135 })];
    expect(suggest(bench, HEAVY, history, {}).target).toContain(`× ${bench.reset}–${bench.max}`);
  });

  it("never demands more than the top of the range", () => {
    const history = [workout(HEAVY, "bench", { reps: [8, 8, 8, 7], weight: 135 })];
    expect(suggest(bench, HEAVY, history, {}).target).toBe("135 lb × 8 / 8 / 8 / 8");
  });

  it("follows the spec cable row example 12/10/9", () => {
    const history = [workout(HEAVY, "crowH", { reps: [12, 10, 9], weight: 100 })];
    expect(suggest(row, HEAVY, history, {}).target).toBe("100 lb × 12 / 10 / 10");
  });

  it("follows the spec squat example 8/7/6", () => {
    const history = [workout("Legs + Abs", "squat", { reps: [8, 7, 6], weight: 185 })];
    expect(suggest(squat, "Legs + Abs", history, {}).target).toBe("185 lb × 8 / 7 / 7");
  });

  it("uses the most recent workout for that day", () => {
    const history = [
      workout(HEAVY, "bench", { reps: [5, 5, 5, 5], weight: 115 }),
      workout(HEAVY, "bench", { reps: [8, 7, 7, 7], weight: 135 }),
    ];
    expect(suggest(bench, HEAVY, history, {}).target).toBe("135 lb × 8 / 8 / 7 / 7");
  });

  it("ignores workouts from a different day", () => {
    const history = [workout(VOLUME, "bench", { reps: [8, 8, 8, 8], weight: 200 })];
    expect(suggest(bench, HEAVY, history, {}).target).toBe("Enter starting lb");
  });
});

describe("exercise-specific increments", () => {
  it("uses the smaller 2.5 lb jump once Heavy Upper pull-ups carry load", () => {
    const wpull = exerciseById(PROGRAM[HEAVY], "wpull");
    const history = [workout(HEAVY, "wpull", { reps: [10, 10, 10], weight: 25 })];
    expect(suggest(wpull, HEAVY, history, {}).weight).toBe(27.5);
  });

  it("treats Heavy Upper pull-ups as bodyweight until plates go on", () => {
    const wpull = exerciseById(PROGRAM[HEAVY], "wpull");
    const history = [workout(HEAVY, "wpull", { reps: [8, 8, 7], weight: 0, unit: "lb" })];
    const s = suggest(wpull, HEAVY, history, {});
    expect(s.target).toBe("Bodyweight \u00d7 8 / 8 / 8");
    expect(s.target).not.toContain("0 lb");
  });

  it("progresses bodyweight pull-ups by reps, without printing a phantom load", () => {
    const pull = exerciseById(PROGRAM[VOLUME], "pull");
    const history = [workout(VOLUME, "pull", { reps: [8, 7, 6], weight: 0, unit: "lb" })];
    const s = suggest(pull, VOLUME, history, {});
    expect(s.target).toBe("Bodyweight × 8 / 7 / 7");
    expect(s.target).not.toContain("0 lb");
  });

  it("sends bodyweight pull-ups to external load once the range tops out", () => {
    const pull = exerciseById(PROGRAM[VOLUME], "pull");
    const history = [workout(VOLUME, "pull", { reps: [10, 10, 10], weight: 0, unit: "lb" })];
    const s = suggest(pull, VOLUME, history, {});
    expect(s.target).toBe("2.5 lb × 6–10");
    expect(s.focus).toBe("All sets reached 10. Start adding external load.");
    expect(s.weight).toBe(2.5);
  });

  it("treats an already-weighted pull-up as a normal loaded exercise", () => {
    const pull = exerciseById(PROGRAM[VOLUME], "pull");
    const history = [workout(VOLUME, "pull", { reps: [10, 9, 8], weight: 25, unit: "lb" })];
    expect(suggest(pull, VOLUME, history, {}).target).toBe("25 lb × 10 / 9 / 9");
  });

  it("handles the lateral-raise range topping out", () => {
    const lat = exerciseById(PROGRAM[VOLUME], "latV");
    const history = [workout(VOLUME, "latV", { reps: [15, 15, 15], weight: 15 })];
    const s = suggest(lat, VOLUME, history, {});
    expect(s.target).toBe("20 lb × 8–15");
    expect(s.focus).toBe("All sets reached 15. Increase load.");
  });
});

describe("non-load exercise types", () => {
  it("still handles optional exercises, though the program no longer has one", () => {
    // The close-grip push-up slot became a progressable triceps movement. The
    // branch stays covered so the behaviour is available if a future program
    // reintroduces an optional exercise.
    const optional: Exercise = {
      id: "synthetic",
      name: "Optional Finisher",
      sets: 2,
      min: 0,
      max: 0,
      type: "optional",
      unit: "reps",
      inc: 0,
      reset: 0,
      rest: 90,
    };
    const s = suggest(optional, VOLUME, [], {});
    expect(s.target).toBe("Optional — 2 sets near failure");
    expect(s.focus).toBe("Record reps; no forced progression.");
    expect(s.weight).toBe("");
  });

  it("progresses the overhead triceps extension like any other isolation", () => {
    const ohtri = exerciseById(PROGRAM[VOLUME], "ohtri");
    expect(ohtri.sets).toBe(3);
    const building = [workout(VOLUME, "ohtri", { reps: [15, 13, 11], weight: 40 })];
    expect(suggest(ohtri, VOLUME, building, {}).target).toBe("40 lb × 15 / 13 / 12");
    const maxed = [workout(VOLUME, "ohtri", { reps: [15, 15, 15], weight: 40 })];
    expect(suggest(ohtri, VOLUME, maxed, {}).target).toBe("45 lb × 10–15");
  });

  it("keeps reverse kegel practice non-progressive", () => {
    const rk = exerciseById(PROGRAM[PELVIC], "pfrelax");
    const history = [workout(PELVIC, "pfrelax", { reps: [180], unit: "sec" })];
    const s = suggest(rk, PELVIC, history, {});
    expect(s.target).toBe("2–3 minutes of relaxed practice");
    expect(s.focus).toBe("Quality only; do not strain.");
  });

  it("progresses a timed hold on time and then on difficulty", () => {
    const hold = exerciseById(PROGRAM[FUNC], "hollow");
    const building = [workout(FUNC, "hollow", { reps: [25, 20, 22], unit: "sec" })];
    expect(suggest(hold, FUNC, building, {}).target).toBe("15–30s per set");
    expect(suggest(hold, FUNC, building, {}).focus).toBe(
      "Prioritize Set 2; add 5–10 sec if form is solid.",
    );

    const maxed = [workout(FUNC, "hollow", { reps: [30, 30, 30], unit: "sec" })];
    expect(suggest(hold, FUNC, maxed, {}).target).toBe("Progress the variation/load");
  });

  it("reads cardio in minutes and never tells it to add load", () => {
    const zone2 = exerciseById(PROGRAM[CARDIO], "zone2");
    const done = [workout(CARDIO, "zone2", { reps: [35], unit: "min" })];
    const s = suggest(zone2, CARDIO, done, {});
    expect(s.target).toBe("30–45 min per set");
    expect(s.focus).toContain("conversational");
    expect(s.weight).toBe("");

    const maxed = [workout(CARDIO, "zone2", { reps: [45], unit: "min" })];
    expect(suggest(zone2, CARDIO, maxed, {}).target).toBe("Hold 45 min or add a session");
  });

  it("keeps hanging leg raise quality-controlled", () => {
    const hlr = exerciseById(PROGRAM[VOLUME], "hlr");
    const building = [workout(VOLUME, "hlr", { reps: [12, 10, 9], unit: "reps" })];
    const s = suggest(hlr, VOLUME, building, {});
    expect(s.target).toBe("Build toward 15 clean reps");
    expect(s.focus).toBe("Prioritize Set 3; no swinging.");

    const maxed = [workout(VOLUME, "hlr", { reps: [15, 15, 15], unit: "reps" })];
    expect(suggest(hlr, VOLUME, maxed, {}).target).toBe("15 / 15 / 15 controlled reps");
  });
});

describe("program integrity", () => {
  it("does not contain a rear delt fly", () => {
    const names = Object.values(PROGRAM)
      .flat()
      .map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes("rear delt"))).toBe(false);
  });

  it("keeps two gym days and four support days", () => {
    expect(Object.keys(PROGRAM)).toEqual([
      HEAVY, VOLUME, FUNC, "Hip Mobility", PELVIC, CARDIO,
    ]);
    expect(PROGRAM[HEAVY]).toHaveLength(7);
    expect(PROGRAM[VOLUME]).toHaveLength(8);
  });

  it("never load-progresses the support days", () => {
    for (const day of [FUNC, "Hip Mobility", PELVIC, CARDIO]) {
      for (const e of PROGRAM[day]) {
        expect(UNTRACKED_TYPES, `${day}/${e.id} must not be load-tracked`).toContain(e.type);
        expect(e.inc, `${day}/${e.id} must not carry an increment`).toBe(0);
      }
    }
  });

  it("gives triceps and biceps comparable weekly volume", () => {
    // The close-grip push-up swap existed to fix a 3-vs-6 split.
    const sets = (id: string) =>
      Object.values(PROGRAM)
        .flat()
        .filter((e) => e.id === id)
        .reduce((n, e) => n + e.sets, 0);
    const triceps = sets("tri") + sets("ohtri");
    const biceps = sets("curl") + sets("hammer");
    expect(triceps).toBe(6);
    expect(biceps).toBe(6);
  });

  it("gives chest 11 direct sets, the most of any muscle", () => {
    const sets = (day: string, id: string) =>
      PROGRAM[day].find((e) => e.id === id)!.sets;
    const chest = sets(HEAVY, "bench") + sets(VOLUME, "incline") + sets(VOLUME, "fly");
    const back =
      sets(HEAVY, "wpull") + sets(HEAVY, "crowH") + sets(VOLUME, "pull") + sets(VOLUME, "crowV");
    expect(chest).toBe(11);
    expect(back).toBe(11);
  });

  it("exposes every exercise by day and id", () => {
    expect(findExercise(HEAVY, "bench")?.name).toBe("Bench Press");
    expect(findExercise(CARDIO, "bench")).toBeUndefined();
  });
});
