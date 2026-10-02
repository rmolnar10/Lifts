/**
 * The wire shape of a program, shared by the `import_program` RPC and by
 * whatever produces one (the built-in program below, or a JSON seed file).
 */

import { PROGRAM, type Exercise, type ProgressionType, type Unit } from "./program";

export interface ProgramExerciseSpec {
  position: number;
  key: string;
  name: string;
  sets: number;
  min_reps: number;
  max_reps: number;
  progression_type: ProgressionType;
  unit: Unit;
  increment: number;
  reset_reps: number;
  rest_seconds: number;
  target_rpe_low?: number | null;
  target_rpe_high?: number | null;
  dropset?: boolean;
  superset_group?: string | null;
  per_side?: boolean;
  warmup_sets?: string | null;
}

export interface ProgramDaySpec {
  name: string;
  position: number;
  exercises: ProgramExerciseSpec[];
}

export interface ProgramBlockSpec {
  name: string;
  week_start: number;
  week_end: number | null;
  days: ProgramDaySpec[];
}

export interface ProgramSpec {
  slug: string;
  name: string;
  notes?: string;
  weeks?: number | null;
  blocks: ProgramBlockSpec[];
}

/** The slug of the program that ships with the app. */
export const BUILTIN_PROGRAM_SLUG = "lifts-3day";

function toSpec(exercise: Exercise, position: number): ProgramExerciseSpec {
  return {
    position,
    key: exercise.id,
    name: exercise.name,
    sets: exercise.sets,
    min_reps: exercise.min,
    max_reps: exercise.max,
    progression_type: exercise.type,
    unit: exercise.unit,
    increment: exercise.inc,
    reset_reps: exercise.reset,
    rest_seconds: exercise.rest,
  };
}

/**
 * The built-in program as a seedable spec.
 *
 * It is one open-ended block: no week structure, the same three days forever.
 * Deriving it from the PROGRAM constant keeps a single source of truth, so
 * editing the program in code still changes what new users get seeded.
 */
export function builtinProgramSpec(): ProgramSpec {
  return {
    slug: BUILTIN_PROGRAM_SLUG,
    name: "Lifts 3-Day",
    notes: "The original program: Heavy Upper, Volume Upper, Legs + Abs.",
    weeks: null,
    blocks: [
      {
        name: "Ongoing",
        week_start: 1,
        week_end: null,
        days: Object.entries(PROGRAM).map(([name, exercises], position) => ({
          name,
          position,
          exercises: exercises.map(toSpec),
        })),
      },
    ],
  };
}
