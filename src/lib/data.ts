"use client";

/**
 * Cloud data access. Every call goes through the anon key and is scoped to the
 * signed-in user by Row Level Security — there is no client-side user filter to
 * forget, and nothing here can read another user's rows.
 */

import { getSupabaseBrowserClient } from "./supabase/client";
import { startKey } from "./program";
import type { AppState, LoggedExercise, StartingWeights, Workout } from "./types";
import type { Unit } from "./program";

interface WorkoutSetRow {
  set_number: number;
  reps: number | string;
}

interface WorkoutExerciseRow {
  exercise_id: string;
  name: string;
  weight: number | string;
  unit: string;
  rir: number | null;
  position: number;
  workout_sets: WorkoutSetRow[] | null;
}

interface WorkoutRow {
  id: string;
  day: string;
  performed_at: string;
  created_at: string;
  notes: string | null;
  workout_exercises: WorkoutExerciseRow[] | null;
}

interface SettingRow {
  day: string;
  exercise_id: string;
  starting_weight: number | string | null;
}

/** Shape the save_workout RPC expects for each exercise. */
export interface ExercisePayload {
  exercise_id: string;
  name: string;
  weight: number;
  unit: Unit;
  rir: number | null;
  reps: number[];
}

function rowToWorkout(row: WorkoutRow): Workout {
  const exercises: Record<string, LoggedExercise> = {};
  const rows = [...(row.workout_exercises ?? [])].sort((a, b) => a.position - b.position);

  for (const ex of rows) {
    const sets = [...(ex.workout_sets ?? [])].sort((a, b) => a.set_number - b.set_number);
    exercises[ex.exercise_id] = {
      name: ex.name,
      reps: sets.map((s) => Number(s.reps)),
      weight: Number(ex.weight),
      unit: ex.unit as Unit,
      rir: ex.rir === null ? null : Number(ex.rir),
    };
  }

  return {
    id: row.id,
    day: row.day,
    date: row.performed_at,
    exercises,
    notes: row.notes ?? "",
  };
}

/** Loads the signed-in user's entire training history. */
export async function loadState(): Promise<AppState> {
  const supabase = getSupabaseBrowserClient();

  const [workoutsResult, settingsResult] = await Promise.all([
    supabase
      .from("workouts")
      .select(
        "id, day, performed_at, created_at, notes, " +
          "workout_exercises (exercise_id, name, weight, unit, rir, position, " +
          "workout_sets (set_number, reps))",
      )
      .order("performed_at", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("user_exercise_settings").select("day, exercise_id, starting_weight"),
  ]);

  if (workoutsResult.error) throw workoutsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const workouts = ((workoutsResult.data ?? []) as unknown as WorkoutRow[]).map(rowToWorkout);

  const starts: StartingWeights = {};
  for (const row of (settingsResult.data ?? []) as unknown as SettingRow[]) {
    starts[startKey(row.day, row.exercise_id)] =
      row.starting_weight === null ? "" : Number(row.starting_weight);
  }

  return { starts, workouts };
}

/**
 * Creates a workout, or fully replaces an existing one when `workoutId` is given.
 * Returns the workout id.
 */
export async function saveWorkout(params: {
  workoutId: string | null;
  day: string;
  performedAt: string | null;
  notes: string;
  exercises: ExercisePayload[];
}): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("save_workout", {
    p_workout_id: params.workoutId,
    p_day: params.day,
    p_performed_at: params.performedAt,
    p_notes: params.notes,
    p_exercises: params.exercises,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
  if (error) throw error;
}

/** Replaces the user's starting weights. An empty value clears that entry. */
export async function saveStartingWeights(starts: StartingWeights): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const payload = Object.entries(starts).map(([key, value]) => {
    const [day, exerciseId] = splitStartKey(key);
    return {
      day,
      exercise_id: exerciseId,
      starting_weight: value === "" ? null : Number(value),
    };
  });
  const { error } = await supabase.rpc("save_starting_weights", { p_starts: payload });
  if (error) throw error;
}

/** Replaces ALL cloud data with the contents of a backup. */
export async function importBackup(state: AppState): Promise<number> {
  const supabase = getSupabaseBrowserClient();

  const starts = Object.entries(state.starts).map(([key, value]) => {
    const [day, exerciseId] = splitStartKey(key);
    return {
      day,
      exercise_id: exerciseId,
      starting_weight: value === "" ? null : Number(value),
    };
  });

  const workouts = state.workouts.map((w) => ({
    day: w.day,
    performed_at: w.date,
    notes: w.notes,
    exercises: Object.entries(w.exercises).map(([id, x]) => ({
      exercise_id: id,
      name: x.name,
      weight: x.weight,
      unit: x.unit,
      rir: x.rir,
      reps: x.reps,
    })),
  }));

  const { data, error } = await supabase.rpc("import_backup", {
    p_starts: starts,
    p_workouts: workouts,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Deletes every workout and starting weight for the signed-in user. */
export async function deleteAllData(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("delete_all_data");
  if (error) throw error;
}

/** `${day}::${exerciseId}` — the day itself may contain no "::" separator. */
function splitStartKey(key: string): [string, string] {
  const index = key.indexOf("::");
  if (index === -1) return [key, ""];
  return [key.slice(0, index), key.slice(index + 2)];
}
