/**
 * Exercise-specific progressive-overload engine.
 *
 * This is a direct port of the V4 `suggest()` function and intentionally produces
 * identical recommendations. The V6 roadmap item (RIR-aware, fatigue-aware coaching)
 * is deliberately NOT implemented here — see docs/ROADMAP.md.
 *
 * Core rule: work every required set toward the top of its rep range, prioritising the
 * weakest set by one clean rep; once every set reaches the top, increase the load and
 * let reps reset toward the bottom of the range.
 */

import type { Exercise } from "./program";
import type { LoggedExercise, StartingWeights, Workout } from "./types";
import { startKey } from "./program";

export interface Suggestion {
  /** Headline target, e.g. `135 lb × 8 / 8 / 7 / 7`. */
  target: string;
  /** Coaching focus, e.g. `Prioritize Set 4; add one clean rep.` */
  focus: string;
  /** Weight to pre-fill into the weight input ("" when the exercise takes no load). */
  weight: number | "";
}

/**
 * The most recent performance of `exercise` on `day`.
 * Workouts are expected in chronological order (oldest first).
 */
export function previousPerformance(
  workouts: Workout[],
  day: string,
  exerciseId: string,
): LoggedExercise | null {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i];
    if (w.day === day && w.exercises[exerciseId]) return w.exercises[exerciseId];
  }
  return null;
}

/** Index of the weakest required set (first occurrence of the minimum). */
export function weakestSetIndex(reps: number[]): number {
  return reps.indexOf(Math.min(...reps));
}

/** True when every required set reached the top of the rep range. */
export function reachedTopOfRange(reps: number[], exercise: Exercise): boolean {
  return reps.length === exercise.sets && reps.every((r) => r >= exercise.max);
}

/**
 * How a load reads inside a target line.
 *
 * Bodyweight movements carry no external load until you start adding plates,
 * and "0 lb × 10 / 9 / 9" is nonsense on a pull-up. This is a deliberate
 * divergence from V4, which printed the raw number for every exercise type —
 * see tests/v4-parity.test.ts, which documents it.
 */
function formatLoad(weight: number, exercise: Exercise): string {
  if (exercise.type === "bodyweight" && !weight) return "Bodyweight";
  return `${weight} ${exercise.unit}`;
}

export function suggest(
  exercise: Exercise,
  day: string,
  workouts: Workout[],
  starts: StartingWeights,
): Suggestion {
  const p = previousPerformance(workouts, day, exercise.id);
  const start = starts[startKey(day, exercise.id)];

  if (exercise.type === "optional") {
    return {
      target: "Optional — 2 sets near failure",
      focus: "Record reps; no forced progression.",
      weight: "",
    };
  }

  if (exercise.type === "practice") {
    return {
      target: "2–3 minutes of relaxed practice",
      focus: "Quality only; do not strain.",
      weight: "",
    };
  }

  if (!p) {
    const hasStart = start !== undefined && start !== "";
    return {
      target: hasStart
        ? `${start} ${exercise.unit} × ${exercise.min}–${exercise.max}`
        : `Enter starting ${exercise.unit}`,
      focus: "Establish a baseline. Aim for about 2–3 RIR.",
      weight: start ?? "",
    };
  }

  const reps = p.reps.map(Number);
  const top = reachedTopOfRange(reps, exercise);
  const low = weakestSetIndex(reps);

  if (exercise.type === "timed") {
    return {
      target: top ? "Progress the variation/load" : `${exercise.min}–${exercise.max}s per set`,
      focus: `Prioritize Set ${low + 1}; add 5–10 sec if form is solid.`,
      weight: "",
    };
  }

  if (exercise.type === "quality") {
    return {
      target: top ? "15 / 15 / 15 controlled reps" : `Build toward ${exercise.max} clean reps`,
      focus: `Prioritize Set ${low + 1}; no swinging.`,
      weight: p.weight,
    };
  }

  if (top) {
    const next = Number(p.weight) + exercise.inc;
    // Topping out a bodyweight movement is the cue to start adding plates,
    // not to "increase load" on something that has none yet.
    const startingToLoad = exercise.type === "bodyweight" && !p.weight;
    return {
      target: `${formatLoad(next, exercise)} × ${exercise.reset}–${exercise.max}`,
      focus: startingToLoad
        ? `All sets reached ${exercise.max}. Start adding external load.`
        : `All sets reached ${exercise.max}. Increase load.`,
      weight: next,
    };
  }

  const targetReps = reps.slice();
  targetReps[low] = Math.min(exercise.max, targetReps[low] + 1);
  return {
    target: `${formatLoad(p.weight, exercise)} × ${targetReps.join(" / ")}`,
    focus: `Prioritize Set ${low + 1}; add one clean rep.`,
    weight: p.weight,
  };
}
