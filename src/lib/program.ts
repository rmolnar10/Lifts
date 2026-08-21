/**
 * Static program definition, ported verbatim from the V4 prototype (`v4/index.html`).
 *
 * Program data is intentionally kept in code rather than in the database: it is the
 * same for every user and changing it must not require a migration. Only the user's
 * performance data (workouts, sets, starting weights) lives in Supabase.
 *
 * Rear delt fly is deliberately absent. Cardio is deliberately not tracked here.
 */

export type ProgressionType =
  | "primary"
  | "isolation"
  | "bodyweight"
  | "quality"
  | "timed"
  | "practice"
  | "optional";

export type Unit = "lb" | "reps" | "sec";

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  min: number;
  max: number;
  type: ProgressionType;
  unit: Unit;
  inc: number;
  reset: number;
  rest: number;
}

export type Program = Record<string, Exercise[]>;

export const PROGRAM: Program = {
  "Heavy Upper": [
    { id: "bench", name: "Bench Press", sets: 4, min: 5, max: 8, type: "primary", unit: "lb", inc: 5, reset: 5, rest: 180 },
    { id: "wpull", name: "Weighted Pull-Up", sets: 4, min: 5, max: 8, type: "primary", unit: "lb", inc: 2.5, reset: 5, rest: 180 },
    { id: "crowH", name: "Cable Row", sets: 3, min: 8, max: 12, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 120 },
    { id: "shoulder", name: "DB Shoulder Press", sets: 3, min: 6, max: 10, type: "primary", unit: "lb", inc: 5, reset: 6, rest: 150 },
    { id: "latH", name: "Lateral Raise", sets: 3, min: 12, max: 20, type: "isolation", unit: "lb", inc: 5, reset: 12, rest: 90 },
    { id: "tri", name: "Triceps Pushdown", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 90 },
    { id: "curl", name: "Curl", sets: 3, min: 8, max: 12, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 90 },
  ],
  "Volume Upper": [
    { id: "incline", name: "Incline DB Press", sets: 4, min: 8, max: 12, type: "primary", unit: "lb", inc: 5, reset: 8, rest: 150 },
    { id: "pull", name: "Pull-Up", sets: 3, min: 6, max: 10, type: "bodyweight", unit: "reps", inc: 0, reset: 6, rest: 150 },
    { id: "crowV", name: "Cable Row", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 120 },
    { id: "latV", name: "Lateral Raise", sets: 3, min: 15, max: 20, type: "isolation", unit: "lb", inc: 5, reset: 15, rest: 90 },
    { id: "hammer", name: "Hammer Curl", sets: 3, min: 8, max: 12, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 90 },
    { id: "pushup", name: "Close-Grip Push-Ups", sets: 2, min: 0, max: 0, type: "optional", unit: "reps", inc: 0, reset: 0, rest: 90 },
  ],
  "Legs + Abs": [
    { id: "squat", name: "Squat", sets: 3, min: 5, max: 8, type: "primary", unit: "lb", inc: 5, reset: 5, rest: 180 },
    { id: "rdl", name: "RDL", sets: 3, min: 8, max: 12, type: "primary", unit: "lb", inc: 5, reset: 8, rest: 150 },
    { id: "legcurl", name: "Leg Curl", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 90 },
    { id: "hlr", name: "Hanging Leg Raise", sets: 3, min: 8, max: 15, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 90 },
    { id: "sideplank", name: "Side Plank", sets: 2, min: 30, max: 60, type: "timed", unit: "sec", inc: 0, reset: 30, rest: 60 },
    { id: "rk", name: "Reverse Kegel Practice", sets: 1, min: 120, max: 180, type: "practice", unit: "sec", inc: 0, reset: 120, rest: 0 },
  ],
};

export const DAYS = Object.keys(PROGRAM);

/** Exercise types that never take an external load input. */
export const UNWEIGHTED_TYPES: ProgressionType[] = ["optional", "timed", "practice", "quality"];

/** Exercise types excluded from starting-weight settings and progress charts. */
export const UNTRACKED_TYPES: ProgressionType[] = ["optional", "timed", "practice", "quality"];

/** Every exercise in the program, paired with the day it belongs to. */
export function allExercises(): { day: string; e: Exercise }[] {
  return Object.entries(PROGRAM).flatMap(([day, list]) => list.map((e) => ({ day, e })));
}

export function findExercise(day: string, exerciseId: string): Exercise | undefined {
  return PROGRAM[day]?.find((e) => e.id === exerciseId);
}

/** Key used for per-user starting weights, kept identical to the V4 storage key. */
export function startKey(day: string, exerciseId: string): string {
  return `${day}::${exerciseId}`;
}
