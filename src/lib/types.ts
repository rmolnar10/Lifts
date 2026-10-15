import type { Unit } from "./program";

/** One exercise as it was actually performed inside a saved workout. */
export interface LoggedExercise {
  name: string;
  reps: number[];
  weight: number;
  unit: Unit;
  rir: number | null;
  /**
   * Did form hold on every rep? `false` means it broke down; null or absent
   * means it was not recorded (every workout logged before V6).
   */
  formOk?: boolean | null;
}

/** How the lifter felt walking in. Absent on workouts logged before V6. */
export type Readiness = "rough" | "normal" | "good";

export const READINESS_LEVELS: Readiness[] = ["rough", "normal", "good"];

/** One bodyweight reading. `date` is a calendar day, YYYY-MM-DD. */
export interface BodyweightEntry {
  date: string;
  weight: number;
}

/** A saved workout. `id` is a Supabase uuid in V5 (V4 backups used a numeric id). */
export interface Workout {
  id: string;
  day: string;
  date: string;
  exercises: Record<string, LoggedExercise>;
  notes: string;
  readiness?: Readiness | null;
}

/** Starting weights, keyed by `${day}::${exerciseId}` exactly as in V4. */
export type StartingWeights = Record<string, number | "">;

/** The full client-side view of a user's data. Mirrors the V4 `state` object. */
export interface AppState {
  starts: StartingWeights;
  workouts: Workout[];
  /**
   * Bodyweight history, oldest first. Belongs to the person rather than the
   * program, so it is the same whichever program is active.
   */
  bodyweight?: BodyweightEntry[];
  /**
   * False when the V6 migration (0006) has not been applied, so readiness,
   * form and bodyweight cannot be saved yet. Absent means unknown/true.
   */
  v6Inputs?: boolean;
}

export const EMPTY_STATE: AppState = { starts: {}, workouts: [] };
