/**
 * The built-in program, seeded into the database for a new account.
 *
 * Originally a verbatim port of the V4 prototype (`v4/index.html`); it has since
 * diverged deliberately. `tests/v4-parity.test.ts` documents every divergence and
 * still proves the progression ENGINE behaves exactly as V4's did.
 *
 * Three gym days carry the hypertrophy work: two upper and one lower. The lower
 * day avoids heavy bracing, which can work against a hypertonic pelvic floor,
 * and hip and pelvic-floor work runs daily as two alternating morning routines.
 * The daily routines and the cardio days are logged but never load-progressed.
 *
 * Rear delt fly is deliberately absent.
 */

export type ProgressionType =
  | "primary"
  | "isolation"
  | "bodyweight"
  | "quality"
  | "timed"
  | "practice"
  | "optional";

export type Unit = "lb" | "reps" | "sec" | "min";

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

  // Only data-backed programs carry these; the built-in program leaves them
  // undefined, which keeps it byte-identical to V4 for the parity harness.
  /** Target effort for the final set as RPE, where 10 is 0 reps in reserve. */
  targetRpe?: [number, number];
  /** Finish the set, cut the load by about half, and keep going. */
  dropset?: boolean;
  /** "A1"/"A2" pair into a superset; undefined means a straight set. */
  supersetGroup?: string | null;
  /** Reps are per limb rather than per set. */
  perSide?: boolean;
  /** Warm-up sets the program suggests, as written (e.g. "2-3"). */
  warmupSets?: string | null;
}

export type Program = Record<string, Exercise[]>;

export const PROGRAM: Program = {
  "Heavy Upper": [
    { id: "bench", name: "Bench Press", sets: 4, min: 5, max: 8, type: "primary", unit: "lb", inc: 5, reset: 5, rest: 180, targetRpe: [8, 9] },
    { id: "wpull", name: "Pull-Up", sets: 3, min: 5, max: 10, type: "bodyweight", unit: "lb", inc: 2.5, reset: 5, rest: 180, targetRpe: [9, 10] },
    { id: "crowH", name: "Seated Cable Row", sets: 3, min: 8, max: 12, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 120, targetRpe: [9, 10] },
    { id: "shoulder", name: "DB Shoulder Press", sets: 3, min: 6, max: 10, type: "primary", unit: "lb", inc: 5, reset: 6, rest: 150, targetRpe: [8, 9] },
    { id: "latH", name: "Lateral Raise", sets: 4, min: 8, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 90, targetRpe: [9, 10], dropset: true },
    { id: "tri", name: "Triceps Pushdown", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 0, targetRpe: [9, 10], dropset: true, supersetGroup: "A1" },
    { id: "curl", name: "Machine Curl", sets: 3, min: 8, max: 12, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 90, targetRpe: [9, 10], dropset: true, supersetGroup: "A2" },
  ],
  "Volume Upper": [
    { id: "incline", name: "Incline Smith Machine Bench Press", sets: 4, min: 6, max: 10, type: "primary", unit: "lb", inc: 5, reset: 6, rest: 150, targetRpe: [8, 9] },
    { id: "fly", name: "Cable Fly", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 90, targetRpe: [9, 10] },
    { id: "pull", name: "Pull-Up", sets: 3, min: 6, max: 10, type: "bodyweight", unit: "lb", inc: 2.5, reset: 6, rest: 150, targetRpe: [9, 10] },
    { id: "crowV", name: "Seated Cable Row", sets: 2, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 120, targetRpe: [9, 10] },
    { id: "latV", name: "Lateral Raise", sets: 4, min: 8, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 90, targetRpe: [9, 10], dropset: true },
    { id: "hammer", name: "Hammer Curl", sets: 3, min: 8, max: 12, type: "isolation", unit: "lb", inc: 5, reset: 8, rest: 0, targetRpe: [9, 10], dropset: true, supersetGroup: "A1" },
    { id: "ohtri", name: "Overhead Triceps Extension", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 90, targetRpe: [9, 10], dropset: true, supersetGroup: "A2" },
    { id: "hlr", name: "Hanging Leg Raise", sets: 3, min: 8, max: 15, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 90 },
  ],
  // Lower-body hypertrophy, chosen to need as little bracing as possible: one
  // unilateral squat, one light hinge, and machines you can breathe through.
  // Efforts stay at RPE 7-9 with no dropsets, exhaling on every effort, so the
  // work never fights the pelvic-floor goal. Roughly 6 sets a week per leg muscle.
  "Lower": [
    { id: "splitsquat", name: "DB Bulgarian Split Squat", sets: 3, min: 8, max: 12, type: "primary", unit: "lb", inc: 5, reset: 8, rest: 120, targetRpe: [7, 8], perSide: true },
    { id: "dbrdl", name: "DB Romanian Deadlift", sets: 3, min: 8, max: 12, type: "primary", unit: "lb", inc: 5, reset: 8, rest: 120, targetRpe: [7, 8] },
    { id: "legext", name: "Leg Extension", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 90, targetRpe: [8, 9] },
    { id: "seatcurl", name: "Seated Leg Curl", sets: 3, min: 10, max: 15, type: "isolation", unit: "lb", inc: 5, reset: 10, rest: 90, targetRpe: [8, 9] },
    { id: "hipabd", name: "Hip Abduction Machine", sets: 2, min: 12, max: 20, type: "isolation", unit: "lb", inc: 5, reset: 12, rest: 60, targetRpe: [8, 9] },
    { id: "hipadd", name: "Hip Adduction Machine", sets: 2, min: 12, max: 20, type: "isolation", unit: "lb", inc: 5, reset: 12, rest: 60, targetRpe: [7, 8] },
  ],
  // Everything below is logged but never load-progressed: the point is control,
  // range of motion and consistency, not overload.
  //
  // The two daily routines alternate as a morning session, so hip and
  // pelvic-floor work happens every day instead of once a week each. A is
  // mobility and down-training; B is hip strength and control. Both end on
  // pelvic-floor relaxation.
  "Daily Hips A (Mobility)": [
    { id: "scissor9090", name: "90/90 Scissor", sets: 2, min: 6, max: 8, type: "quality", unit: "reps", inc: 0, reset: 6, rest: 30, perSide: true },
    { id: "rollerstep", name: "Foam-Roller Step-Over", sets: 2, min: 8, max: 10, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 30, perSide: true },
    { id: "pigeonpush", name: "Unweighted Pigeon Push-Up", sets: 2, min: 6, max: 10, type: "quality", unit: "reps", inc: 0, reset: 6, rest: 30, perSide: true },
    { id: "stepthru", name: "Step-Through Lunge", sets: 2, min: 6, max: 8, type: "quality", unit: "reps", inc: 0, reset: 6, rest: 30, perSide: true },
    { id: "cossack", name: "Cossack Squat Shift", sets: 2, min: 6, max: 8, type: "quality", unit: "reps", inc: 0, reset: 6, rest: 30, perSide: true },
    { id: "hkhip", name: "Half-Kneeling Hip Mobility", sets: 2, min: 30, max: 45, type: "timed", unit: "sec", inc: 0, reset: 30, rest: 30, perSide: true },
    { id: "beardog", name: "Bear Hold → Downward Dog", sets: 2, min: 5, max: 8, type: "quality", unit: "reps", inc: 0, reset: 5, rest: 45 },
    { id: "pfrelax", name: "360° Breathing / Pelvic-Floor Relaxation", sets: 1, min: 120, max: 180, type: "practice", unit: "sec", inc: 0, reset: 120, rest: 0 },
  ],
  "Daily Hips B (Strength)": [
    { id: "sidelunge", name: "Side Lunge", sets: 2, min: 8, max: 10, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 45, perSide: true },
    { id: "slbridge", name: "Single-Leg Glute Bridge", sets: 2, min: 8, max: 12, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 45, perSide: true },
    { id: "bridgeknee", name: "Bridge + Alternating Knee Lift", sets: 2, min: 8, max: 10, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 45, perSide: true },
    { id: "splankhip", name: "Side Plank + Banded Hip Raise", sets: 2, min: 8, max: 15, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 45, perSide: true },
    { id: "pigeonraise", name: "Pigeon Raise", sets: 2, min: 8, max: 15, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 45, perSide: true },
    { id: "monster", name: "Monster Steps", sets: 2, min: 10, max: 15, type: "quality", unit: "reps", inc: 0, reset: 10, rest: 45, perSide: true },
    { id: "supine90", name: "Supine 90° Leg/Hip Movement", sets: 2, min: 8, max: 10, type: "quality", unit: "reps", inc: 0, reset: 8, rest: 45, perSide: true },
    { id: "deadbug", name: "Dead Bug (exhale on each rep)", sets: 2, min: 6, max: 10, type: "quality", unit: "reps", inc: 0, reset: 6, rest: 45, perSide: true },
    { id: "breath360", name: "360° Breathing / Reverse Kegel", sets: 1, min: 120, max: 180, type: "practice", unit: "sec", inc: 0, reset: 120, rest: 0 },
  ],
  // About 150 min of zone 2 a week over 3-4 sessions, plus one interval session.
  // Keep the intervals away from the morning before an upper day.
  "Cardio": [
    { id: "zone2", name: "Zone 2 Cardio", sets: 1, min: 30, max: 45, type: "timed", unit: "min", inc: 0, reset: 30, rest: 0 },
  ],
  "Intervals": [
    { id: "intervals", name: "Intervals (4×4 min hard or 8×30 s sprints)", sets: 1, min: 20, max: 30, type: "timed", unit: "min", inc: 0, reset: 20, rest: 0 },
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
