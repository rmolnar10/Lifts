/**
 * Deload reminder.
 *
 * Counts STRENGTH sessions for the active program and raises a reminder every
 * `DELOAD_EVERY_N_WORKOUTS` of them. A deload here is not a week off: it is the
 * same sessions run at 3-4 RIR, which sheds accumulated fatigue without losing
 * the groove on any lift.
 *
 * Mobility, pelvic-floor and cardio sessions deliberately do not count. They
 * carry no load and create no fatigue worth deloading from, and counting them
 * would fire the reminder two or three times as often as it should.
 */

import { UNTRACKED_TYPES } from "./program";
import type { ActiveProgram } from "./activeProgram";
import type { Workout } from "./types";

/**
 * Strength sessions between deloads. At two gym sessions a week, 7 is a deload
 * roughly every three and a half weeks. This is the only number to change.
 */
export const DELOAD_EVERY_N_WORKOUTS = 7;

export interface DeloadStatus {
  /** Strength sessions logged since the last deload point. */
  sinceDeload: number;
  /** Strength sessions still to go before the next one. */
  remaining: number;
  /** True when the next strength session should be the deload. */
  due: boolean;
  message: string;
}

/** Days whose exercises include at least one the engine progresses by load. */
export function strengthDays(program: ActiveProgram): Set<string> {
  return new Set(
    program.dayOrder.filter((day) =>
      (program.days[day] ?? []).some((e) => !UNTRACKED_TYPES.includes(e.type)),
    ),
  );
}

/**
 * `program` is optional so a caller without one still gets a sane answer: with
 * no program to classify days, every workout counts.
 */
export function deloadStatus(
  workouts: Workout[],
  program?: ActiveProgram,
  every: number = DELOAD_EVERY_N_WORKOUTS,
): DeloadStatus {
  const counted = program
    ? ((days) => workouts.filter((w) => days.has(w.day)))(strengthDays(program))
    : workouts;

  const total = counted.length;
  // After 7 strength sessions the 8th is the deload, so this cycles 0..every-1.
  const sinceDeload = every > 0 ? total % every : 0;
  const due = total > 0 && sinceDeload === 0;
  const remaining = due ? 0 : every - sinceDeload;

  return {
    sinceDeload,
    remaining,
    due,
    message: due
      ? `Deload this session. You have logged ${total} strength workouts. Run the same exercises at 3–4 RIR — roughly two-thirds of your usual load, every set well short of failure. Do not skip it and do not chase reps.`
      : `${remaining} strength workout${remaining === 1 ? "" : "s"} until your next deload.`,
  };
}
