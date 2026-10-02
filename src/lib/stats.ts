/**
 * Derived metrics: personal records, logged volume and estimated 1RM.
 * Ported from V4 so dashboard/PR/progress numbers stay identical.
 */

import { allExercisesIn, type ActiveProgram } from "./activeProgram";
import type { Workout } from "./types";

export interface PersonalRecord {
  name: string;
  day: string;
  type: "Load PR" | "Rep PR";
  value: string;
}

export function calcPRs(workouts: Workout[], program: ActiveProgram): PersonalRecord[] {
  const result: PersonalRecord[] = [];
  allExercisesIn(program).forEach(({ day, e }) => {
    const entries = workouts.filter((w) => w.day === day && w.exercises[e.id]);
    if (!entries.length) return;
    const load = Math.max(...entries.map((w) => w.exercises[e.id].weight || 0));
    const rep = Math.max(...entries.flatMap((w) => w.exercises[e.id].reps));
    if (load) result.push({ name: e.name, day, type: "Load PR", value: `${load} ${e.unit}` });
    result.push({ name: e.name, day, type: "Rep PR", value: `${rep} reps` });
  });
  return result;
}

/** Total logged load × reps across every saved workout. */
export function totalVolume(workouts: Workout[]): number {
  return workouts.reduce(
    (total, w) =>
      total +
      Object.values(w.exercises).reduce(
        (sum, x) => sum + (x.weight || 0) * x.reps.reduce((q, r) => q + r, 0),
        0,
      ),
    0,
  );
}

/** Epley estimate; returns 0 when there is no load or no reps to estimate from. */
export function estimatedOneRepMax(weight: number, bestReps: number): number {
  if (!weight || !bestReps) return 0;
  return weight * (1 + bestReps / 30);
}
