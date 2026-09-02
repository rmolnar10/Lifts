/**
 * Exercises that have left the program.
 *
 * Saving a workout rebuilds its exercise list from the current PROGRAM. A
 * workout logged under an earlier version can contain exercises the program no
 * longer has — close-grip push-ups, for instance — and rebuilding would drop
 * them, deleting history the user never asked to delete.
 */

import { PROGRAM } from "./program";
import type { Unit } from "./program";
import type { Workout } from "./types";

export interface RetiredExercisePayload {
  exercise_id: string;
  name: string;
  weight: number;
  unit: Unit;
  rir: number | null;
  reps: number[];
}

/**
 * The performances in `workout` whose exercise is no longer part of `day`,
 * shaped for save_workout so they can be written back untouched.
 */
export function retiredExercisePayloads(
  day: string,
  workout: Workout | null,
): RetiredExercisePayload[] {
  if (!workout) return [];
  const inProgram = new Set((PROGRAM[day] ?? []).map((e) => e.id));

  return Object.entries(workout.exercises)
    .filter(([id]) => !inProgram.has(id))
    .map(([id, performed]) => ({
      exercise_id: id,
      name: performed.name,
      weight: performed.weight,
      unit: performed.unit,
      rir: performed.rir,
      reps: performed.reps,
    }));
}
