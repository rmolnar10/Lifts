/**
 * Parity harness: runs the ORIGINAL V4 implementation straight out of
 * `v4/index.html` and asserts the ported TypeScript engine still computes what
 * V4 computed.
 *
 * The program is no longer frozen — it is ours to tune — so parity is driven by
 * V4's OWN exercise definitions rather than the live PROGRAM. That separates
 * two questions that used to be tangled together:
 *
 *   1. Does the engine still behave like V4?  (this file, strictly)
 *   2. Has the program changed only where we meant it to?  (the drift test
 *      below, which lists every intentional difference)
 *
 * One deliberate divergence is documented and excluded from the strict
 * comparison: bodyweight movements carrying no external load. V4 printed
 * "0 reps × 10 / 9 / 9" for a pull-up; we print "Bodyweight × 10 / 9 / 9" and
 * tell the lifter to start adding plates once the range tops out.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { PROGRAM, type Exercise } from "@/lib/program";
import { previousPerformance, suggest } from "@/lib/progression";
import { calcPRs, totalVolume } from "@/lib/stats";
import type { StartingWeights, Workout } from "@/lib/types";
import { builtinActiveProgram } from "./helpers";

interface V4Suggestion {
  t: string;
  f: string;
  w: number | string;
}

interface V4Sandbox {
  PROGRAM: Record<string, Exercise[]>;
  setScenario: (state: { starts: StartingWeights; workouts: Workout[] }, day: string) => void;
  suggest: (exercise: { id: string }) => V4Suggestion;
  calcPRs: () => { name: string; day: string; type: string; value: string }[];
}

/** Extracts the V4 program/progression/PR source and evaluates it in a sandbox. */
function loadV4(): V4Sandbox {
  const html = readFileSync(path.join(process.cwd(), "v4", "index.html"), "utf8");

  const start = html.indexOf("const PROGRAM=");
  const end = html.indexOf("function nav(");
  if (start === -1 || end === -1) throw new Error("Could not locate the V4 progression source");

  const prsStart = html.indexOf("function calcPRs(");
  const prsEnd = html.indexOf("function PRs(");
  if (prsStart === -1 || prsEnd === -1) throw new Error("Could not locate the V4 PR source");

  // `const PROGRAM` / `let state` are lexical bindings, not globals, so the
  // harness has to be appended inside the same script scope to reach them.
  const bridge = `
    globalThis.__v4 = {
      PROGRAM,
      suggest,
      calcPRs,
      setScenario(nextState, nextDay) { state = nextState; day = nextDay; },
    };
  `;

  const source = html.slice(start, end) + html.slice(prsStart, prsEnd) + bridge;

  const context: Record<string, unknown> = {
    // V4 read its data out of localStorage at start-up; the harness replaces
    // `state` afterwards, so an empty store is all that is needed.
    localStorage: { getItem: () => null, setItem: () => undefined },
    document: undefined,
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  const bridged = (context as { __v4?: V4Sandbox }).__v4;
  if (!bridged) throw new Error("V4 harness bridge was not installed");
  return bridged;
}

const v4 = loadV4();

/** Deterministic PRNG so a failure is always reproducible. */
function makeRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function buildHistory(
  random: () => number,
  day: string,
  count: number,
  list: Exercise[],
): Workout[] {
  const workouts: Workout[] = [];
  for (let i = 0; i < count; i += 1) {
    const exercises: Workout["exercises"] = {};
    for (const exercise of list) {
      if (random() < 0.15) continue; // Sometimes an exercise was skipped.
      const span = Math.max(1, exercise.max - exercise.min);
      exercises[exercise.id] = {
        name: exercise.name,
        reps: Array.from({ length: exercise.sets }, () =>
          Math.round(exercise.min + random() * span * 1.1),
        ),
        weight: Math.round(random() * 40) * 2.5,
        unit: exercise.unit,
        rir: random() < 0.3 ? null : Math.floor(random() * 5),
      };
    }
    workouts.push({
      id: `w${i}`,
      day,
      date: new Date(2026, 0, i + 1).toISOString(),
      exercises,
      notes: "",
    });
  }
  return workouts;
}

/**
 * Every intentional difference between V4's program and the current one, keyed
 * by day then exercise id. Anything not listed here is drift and fails.
 */
const INTENTIONAL_PROGRAM_CHANGES: Record<string, Record<string, string>> = {
  "Heavy Upper": {
    wpull:
      "Weighted Pull-Up → bodyweight Pull-Up 4×5–10: these were always done at bodyweight and logged as 165 lb",
    crowH: "renamed Cable Row → Seated Cable Row to match the machine actually used",
    latH: "12–20 → 8–15: the user dislikes very high reps and 8–15 is still well inside the effective range",
    curl: "renamed Curl → DB Curl to distinguish it from the cable curl on Volume Upper",
  },
  "Volume Upper": {
    incline:
      "4×8–12 → 5×6–10, then renamed to Incline Smith Machine Bench Press: chest is the stated priority but was getting fewer weekly sets than back",
    pull: "unit reps → lb with a 2.5 lb increment, so bodyweight pull-ups can progress to weighted",
    pushup: "removed: optional and unprogressed, leaving direct triceps volume at 3 sets/week",
    ohtri: "added: Overhead Triceps Extension 3×10–15, bringing triceps to 6 sets/week",
    crowV: "renamed Cable Row → Seated Cable Row to match the machine actually used",
    latV: "15–20 → 8–15, matching Heavy Upper",
    hammer: "removed: replaced by the Bayesian cable curl",
    bayesian:
      "added: Bayesian Cable Curl 3×10–15, a long-length biceps movement in place of the hammer curl",
  },
};

/** Ids whose definition is byte-identical in both programs. */
function unchangedIds(day: string): string[] {
  const mine = new Map(PROGRAM[day].map((e) => [e.id, e]));
  return v4.PROGRAM[day]
    .filter((e) => JSON.stringify(mine.get(e.id)) === JSON.stringify(e))
    .map((e) => e.id);
}

describe("program drift", () => {
  it("differs from V4 only where we intended", () => {
    expect(Object.keys(v4.PROGRAM)).toEqual(Object.keys(PROGRAM));

    for (const day of Object.keys(v4.PROGRAM)) {
      const theirs = new Map(v4.PROGRAM[day].map((e) => [e.id, e]));
      const mine = new Map(PROGRAM[day].map((e) => [e.id, e]));
      const changed = new Set<string>();

      for (const [id, exercise] of theirs) {
        if (JSON.stringify(mine.get(id)) !== JSON.stringify(exercise)) changed.add(id);
      }
      for (const id of mine.keys()) {
        if (!theirs.has(id)) changed.add(id);
      }

      const expected = new Set(Object.keys(INTENTIONAL_PROGRAM_CHANGES[day] ?? {}));
      expect([...changed].sort(), `unexpected program drift on ${day}`).toEqual(
        [...expected].sort(),
      );
    }
  });

  it("keeps rear delt fly and cardio out of the program", () => {
    const names = Object.values(PROGRAM)
      .flat()
      .map((e) => e.name.toLowerCase());
    expect(names.some((n) => n.includes("rear delt"))).toBe(false);
    expect(names.some((n) => /cardio|run|walk|bike/.test(n))).toBe(false);
  });
});

describe("V4 engine parity", () => {
  it("produces identical suggestions for V4's own exercises", () => {
    const random = makeRandom(20260821);
    let compared = 0;
    let diverged = 0;

    for (let scenario = 0; scenario < 300; scenario += 1) {
      const days = Object.keys(v4.PROGRAM);
      const day = days[Math.floor(random() * days.length)];
      const list = v4.PROGRAM[day];
      const workouts = buildHistory(random, day, Math.floor(random() * 5), list);

      const starts: StartingWeights = {};
      for (const exercise of list) {
        const roll = random();
        if (roll < 0.4) continue;
        starts[`${day}::${exercise.id}`] = roll < 0.5 ? "" : Math.round(random() * 40) * 5;
      }

      v4.setScenario({ starts, workouts }, day);

      for (const exercise of list) {
        const original = v4.suggest(exercise);
        const ported = suggest(exercise, day, workouts, starts);
        const detail = `${day}/${exercise.id} scenario ${scenario}`;

        // Documented divergence: a bodyweight movement carrying no load.
        const previous = previousPerformance(workouts, day, exercise.id);
        const bodyweightUnloaded = exercise.type === "bodyweight" && previous?.weight === 0;

        if (bodyweightUnloaded) {
          expect(ported.target, `divergent target should not be V4's ${detail}`).not.toBe(
            original.t,
          );
          diverged += 1;
        } else {
          expect(ported.target, `target ${detail}`).toBe(original.t);
          expect(ported.focus, `focus ${detail}`).toBe(original.f);
        }

        // The recommended load never diverges, in any case.
        expect(ported.weight, `weight ${detail}`).toBe(original.w);
        compared += 1;
      }
    }

    expect(compared).toBeGreaterThan(1500);
    // If this hits zero the divergence branch is untested, not absent.
    expect(diverged).toBeGreaterThan(0);
  });

  it("produces identical PRs and logged volume for unchanged exercises", () => {
    const random = makeRandom(7);

    for (let scenario = 0; scenario < 40; scenario += 1) {
      const workouts = Object.keys(v4.PROGRAM).flatMap((day) => {
        const keep = new Set(unchangedIds(day));
        return buildHistory(
          random,
          day,
          Math.floor(random() * 4),
          v4.PROGRAM[day].filter((e) => keep.has(e.id)),
        );
      });

      v4.setScenario({ starts: {}, workouts }, Object.keys(PROGRAM)[0]);
      expect(calcPRs(workouts, builtinActiveProgram())).toEqual(v4.calcPRs());

      const v4Volume = workouts.reduce(
        (a, w) =>
          a +
          Object.values(w.exercises).reduce(
            (s, x) => s + (x.weight || 0) * x.reps.reduce((q, r) => q + r, 0),
            0,
          ),
        0,
      );
      expect(totalVolume(workouts)).toBe(v4Volume);
    }
  });
});
