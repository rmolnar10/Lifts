import type { Unit } from "./program";

/** One exercise as it was actually performed inside a saved workout. */
export interface LoggedExercise {
  name: string;
  reps: number[];
  weight: number;
  unit: Unit;
  rir: number | null;
}

/** A saved workout. `id` is a Supabase uuid in V5 (V4 backups used a numeric id). */
export interface Workout {
  id: string;
  day: string;
  date: string;
  exercises: Record<string, LoggedExercise>;
  notes: string;
}

/** Starting weights, keyed by `${day}::${exerciseId}` exactly as in V4. */
export type StartingWeights = Record<string, number | "">;

/** The full client-side view of a user's data. Mirrors the V4 `state` object. */
export interface AppState {
  starts: StartingWeights;
  workouts: Workout[];
}

export const EMPTY_STATE: AppState = { starts: {}, workouts: [] };
