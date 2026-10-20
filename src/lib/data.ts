"use client";

/**
 * Cloud data access. Every call goes through the anon key and is scoped to the
 * signed-in user by Row Level Security — there is no client-side user filter to
 * forget, and nothing here can read another user's rows.
 */

import { getSupabaseBrowserClient } from "./supabase/client";
import { startKey } from "./program";
import type {
  AppState,
  BodyweightEntry,
  LoggedExercise,
  Readiness,
  StartingWeights,
  Workout,
} from "./types";
import type { Unit } from "./program";
import { LEGACY_PROGRAM_ID } from "./activeProgram";
import { parsePlan, type MealDay, type MealPlan } from "./meals";

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
  /** Absent until migration 0006 is applied. */
  form_ok?: boolean | null;
  position: number;
  workout_sets: WorkoutSetRow[] | null;
}

interface WorkoutRow {
  id: string;
  day: string;
  performed_at: string;
  created_at: string;
  notes: string | null;
  /** Absent until migration 0006 is applied. */
  readiness?: string | null;
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
  /** Ignored by the pre-V6 save_workout, so sending it is always safe. */
  form_ok?: boolean | null;
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
      formOk: ex.form_ok ?? null,
    };
  }

  return {
    id: row.id,
    day: row.day,
    date: row.performed_at,
    exercises,
    notes: row.notes ?? "",
    readiness: (row.readiness as Readiness | null | undefined) ?? null,
  };
}

/**
 * True when an error means a V6 column, table or function does not exist yet,
 * i.e. migration 0006 has not been applied to this project.
 */
export function isMissingV6Schema(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "42703" || // undefined column
    code === "42P01" || // undefined table
    code === "42883" || // undefined function
    code === "PGRST202" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    /column .* does not exist/i.test(message) ||
    /could not find the (function|table)/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

const WORKOUT_COLUMNS = (v6: boolean) =>
  `id, day, performed_at, created_at, notes, ${v6 ? "readiness, " : ""}` +
  `workout_exercises (exercise_id, name, weight, unit, rir, ${v6 ? "form_ok, " : ""}position, ` +
  "workout_sets (set_number, reps))";

/** Loads the signed-in user's history for one program, plus their bodyweight. */
export async function loadState(programId: string): Promise<AppState> {
  const supabase = getSupabaseBrowserClient();

  // Before the programs migration lands there is nothing to scope by, so query
  // exactly as the app did previously.
  const legacy = programId === LEGACY_PROGRAM_ID;

  const workoutQuery = (v6: boolean) => {
    let query = supabase.from("workouts").select(WORKOUT_COLUMNS(v6));
    if (!legacy) query = query.eq("program_id", programId);
    return query
      .order("performed_at", { ascending: true })
      .order("created_at", { ascending: true });
  };

  let settingsQuery = supabase
    .from("user_exercise_settings")
    .select("day, exercise_id, starting_weight");
  if (!legacy) settingsQuery = settingsQuery.eq("program_id", programId);

  const [firstWorkouts, settingsResult, bodyweight] = await Promise.all([
    workoutQuery(true),
    settingsQuery,
    loadBodyweight(),
  ]);

  // A deploy can land before migration 0006 does. Read history the V5 way
  // rather than failing to load anything.
  let workoutsResult = firstWorkouts;
  let v6Inputs = bodyweight !== null;
  if (workoutsResult.error && isMissingV6Schema(workoutsResult.error)) {
    v6Inputs = false;
    workoutsResult = await workoutQuery(false);
  }

  if (workoutsResult.error) throw workoutsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const workouts = ((workoutsResult.data ?? []) as unknown as WorkoutRow[]).map(rowToWorkout);

  const starts: StartingWeights = {};
  for (const row of (settingsResult.data ?? []) as unknown as SettingRow[]) {
    starts[startKey(row.day, row.exercise_id)] =
      row.starting_weight === null ? "" : Number(row.starting_weight);
  }

  return { starts, workouts, bodyweight: bodyweight ?? [], v6Inputs };
}

/** Bodyweight history, oldest first. Null when the table does not exist yet. */
async function loadBodyweight(): Promise<BodyweightEntry[] | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("body_metrics")
    .select("measured_on, weight")
    .order("measured_on", { ascending: true });
  if (error) {
    if (isMissingV6Schema(error)) return null;
    throw error;
  }
  return ((data ?? []) as { measured_on: string; weight: number | string }[]).map((row) => ({
    date: row.measured_on,
    weight: Number(row.weight),
  }));
}

/** Records one day's bodyweight; `null` removes that day's entry. */
export async function logBodyweight(date: string, weight: number | null): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("log_bodyweight", {
    p_measured_on: date,
    p_weight: weight,
  });
  if (error) throw error;
}

/**
 * The last 60 days of meal checks, newest first. Null until migration 0007 is
 * applied.
 */
export async function loadMealDays(): Promise<MealDay[] | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("meal_checks")
    .select("day, checked, plan")
    .order("day", { ascending: false })
    .limit(60);
  if (error) {
    if (isMissingV6Schema(error)) return null;
    throw error;
  }
  return ((data ?? []) as { day: string; checked: unknown; plan: unknown }[]).map((row) => ({
    day: row.day,
    checked: Array.isArray(row.checked) ? row.checked.filter((c): c is string => typeof c === "string") : [],
    plan: parsePlan(row.plan),
  }));
}

export async function saveMealChecks(day: string, checked: string[], plan: MealPlan): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("set_meal_checks", {
    p_day: day,
    p_checked: checked,
    p_plan: plan,
  });
  if (error) throw error;
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
  programId: string;
  weekNumber: number | null;
  readiness?: Readiness | null;
}): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("save_workout", {
    p_workout_id: params.workoutId,
    p_day: params.day,
    p_performed_at: params.performedAt,
    p_notes: params.notes,
    p_exercises: params.exercises,
    // Omitted entirely in legacy mode so the pre-programs function signature
    // still matches.
    ...(params.programId === LEGACY_PROGRAM_ID
      ? {}
      : { p_program_id: params.programId, p_week_number: params.weekNumber }),
  });
  if (error) throw error;
  const workoutId = data as string;

  // Readiness is a separate call so save_workout's signature stays as 0004
  // defined it. Losing it to a missing migration must not lose the workout.
  // An edit always writes it, so clearing it sticks.
  if (params.readiness || params.workoutId) {
    const result = await supabase.rpc("set_workout_readiness", {
      p_workout_id: workoutId,
      p_readiness: params.readiness ?? null,
    });
    if (result.error && !isMissingV6Schema(result.error)) throw result.error;
  }

  return workoutId;
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
  if (error) throw error;
}

/** Replaces the user's starting weights. An empty value clears that entry. */
export async function saveStartingWeights(
  starts: StartingWeights,
  programId: string,
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const payload = Object.entries(starts).map(([key, value]) => {
    const [day, exerciseId] = splitStartKey(key);
    return {
      day,
      exercise_id: exerciseId,
      starting_weight: value === "" ? null : Number(value),
    };
  });
  const { error } = await supabase.rpc("save_starting_weights", {
    p_starts: payload,
    ...(programId === LEGACY_PROGRAM_ID ? {} : { p_program_id: programId }),
  });
  if (error) throw error;
}

/** Replaces this program's cloud data with the contents of a backup. */
export async function importBackup(state: AppState, programId: string): Promise<number> {
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
    readiness: w.readiness ?? null,
    exercises: Object.entries(w.exercises).map(([id, x]) => ({
      exercise_id: id,
      name: x.name,
      weight: x.weight,
      unit: x.unit,
      rir: x.rir,
      form_ok: x.formOk ?? null,
      reps: x.reps,
    })),
  }));

  const { data, error } = await supabase.rpc("import_backup", {
    p_starts: starts,
    p_workouts: workouts,
    ...(programId === LEGACY_PROGRAM_ID ? {} : { p_program_id: programId }),
  });
  if (error) throw error;

  // Bodyweight belongs to the person, not the program, so a backup adds to it
  // rather than replacing it.
  for (const entry of state.bodyweight ?? []) {
    const result = await supabase.rpc("log_bodyweight", {
      p_measured_on: entry.date,
      p_weight: entry.weight,
    });
    if (result.error) {
      if (isMissingV6Schema(result.error)) break;
      throw result.error;
    }
  }

  return Number(data ?? 0);
}

/** Deletes every workout and starting weight belonging to one program. */
export async function deleteAllData(programId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc(
    "delete_all_data",
    programId === LEGACY_PROGRAM_ID ? {} : { p_program_id: programId },
  );
  if (error) throw error;
}

/** `${day}::${exerciseId}` — the day itself may contain no "::" separator. */
function splitStartKey(key: string): [string, string] {
  const index = key.indexOf("::");
  if (index === -1) return [key, ""];
  return [key.slice(0, index), key.slice(index + 2)];
}
