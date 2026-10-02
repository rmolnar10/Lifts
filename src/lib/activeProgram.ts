/**
 * The program the user is currently running, resolved to a single week's worth
 * of days and exercises.
 *
 * Views work against this rather than the PROGRAM constant, so the same code
 * renders the built-in plan and any imported one.
 */

import { PROGRAM, type Exercise } from "./program";

export interface ActiveProgram {
  id: string;
  slug: string;
  name: string;
  /** Total weeks for a finite plan, null for one that simply repeats. */
  weeks: number | null;
  /** Which week of the plan is being trained. 1 for plans without weeks. */
  week: number;
  /** The block covering `week`, for display. */
  blockName: string;
  /** Does this plan actually vary by week? */
  hasWeeks: boolean;
  dayOrder: string[];
  days: Record<string, Exercise[]>;
}

/**
 * Stands in for a program id before the programs migration has been applied.
 * In this mode the app reads the hardcoded program and queries exactly as it
 * did before programs existed, so a deploy cannot outrun its migration.
 */
export const LEGACY_PROGRAM_ID = "__legacy__";

/** The hardcoded program, for use in legacy mode. */
export function legacyProgram(): ActiveProgram {
  return {
    id: LEGACY_PROGRAM_ID,
    slug: "lifts-3day",
    name: "Lifts 3-Day",
    weeks: null,
    week: 1,
    blockName: "",
    hasWeeks: false,
    dayOrder: Object.keys(PROGRAM),
    days: PROGRAM,
  };
}

export function exercisesForDay(program: ActiveProgram, day: string): Exercise[] {
  return program.days[day] ?? [];
}

/** Every exercise in the active week, paired with its day. */
export function allExercisesIn(program: ActiveProgram): { day: string; e: Exercise }[] {
  return program.dayOrder.flatMap((day) => (program.days[day] ?? []).map((e) => ({ day, e })));
}

export function findExerciseIn(
  program: ActiveProgram,
  day: string,
  exerciseId: string,
): Exercise | undefined {
  return (program.days[day] ?? []).find((e) => e.id === exerciseId);
}

/** The first day of the program, used as the default selection. */
export function defaultDay(program: ActiveProgram): string {
  return program.dayOrder[0] ?? "";
}

/**
 * A program's RPE target expressed as reps in reserve, which is what the app
 * actually logs. RPE 10 is 0 RIR, RPE 8 is 2 RIR.
 */
export function targetRirLabel(exercise: Exercise): string | null {
  if (!exercise.targetRpe) return null;
  const [rpeLow, rpeHigh] = exercise.targetRpe;
  const low = 10 - rpeHigh;
  const high = 10 - rpeLow;
  return low === high ? `${low} RIR` : `${low}–${high} RIR`;
}
