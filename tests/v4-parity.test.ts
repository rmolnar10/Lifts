/**
 * Parity harness: runs the ORIGINAL V4 implementation straight out of
 * `v4/index.html` and asserts the ported TypeScript engine returns identical
 * recommendations across a large generated matrix of histories.
 *
 * This is the guard for "preserve all V4 functionality" — if a future change
 * alters progression behaviour, this fails.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { PROGRAM } from "@/lib/program";
import { suggest } from "@/lib/progression";
import { calcPRs, totalVolume } from "@/lib/stats";
import type { StartingWeights, Workout } from "@/lib/types";

interface V4Suggestion {
  t: string;
  f: string;
  w: number | string;
}

interface V4Sandbox {
  PROGRAM: Record<string, { id: string }[]>;
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

function buildHistory(random: () => number, day: string, count: number): Workout[] {
  const workouts: Workout[] = [];
  for (let i = 0; i < count; i += 1) {
    const exercises: Workout["exercises"] = {};
    for (const exercise of PROGRAM[day]) {
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

describe("V4 parity", () => {
  it("loads the original V4 program definition unchanged", () => {
    expect(Object.keys(v4.PROGRAM)).toEqual(Object.keys(PROGRAM));
    for (const day of Object.keys(PROGRAM)) {
      expect(v4.PROGRAM[day]).toEqual(PROGRAM[day]);
    }
  });

  it("produces identical suggestions across generated histories", () => {
    const random = makeRandom(20260821);
    let comparisons = 0;

    for (let scenario = 0; scenario < 300; scenario += 1) {
      const days = Object.keys(PROGRAM);
      const day = days[Math.floor(random() * days.length)];
      const workouts = buildHistory(random, day, Math.floor(random() * 5));

      const starts: StartingWeights = {};
      for (const exercise of PROGRAM[day]) {
        const roll = random();
        if (roll < 0.4) continue;
        starts[`${day}::${exercise.id}`] = roll < 0.5 ? "" : Math.round(random() * 40) * 5;
      }

      v4.setScenario({ starts, workouts }, day);

      for (const exercise of PROGRAM[day]) {
        const original = v4.suggest(exercise);
        const ported = suggest(exercise, day, workouts, starts);
        const detail = `${day}/${exercise.id} scenario ${scenario}`;

        expect(ported.target, `target ${detail}`).toBe(original.t);
        expect(ported.focus, `focus ${detail}`).toBe(original.f);
        expect(ported.weight, `weight ${detail}`).toBe(original.w);
        comparisons += 1;
      }
    }

    expect(comparisons).toBeGreaterThan(1500);
  });

  it("produces identical PRs and logged volume", () => {
    const random = makeRandom(7);

    for (let scenario = 0; scenario < 40; scenario += 1) {
      const workouts = Object.keys(PROGRAM).flatMap((day) =>
        buildHistory(random, day, Math.floor(random() * 4)),
      );

      v4.setScenario({ starts: {}, workouts }, Object.keys(PROGRAM)[0]);
      expect(calcPRs(workouts)).toEqual(v4.calcPRs());

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
