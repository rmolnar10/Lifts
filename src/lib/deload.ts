/**
 * Deload reminder.
 *
 * Counts saved workouts for the active program and raises a reminder every
 * `DELOAD_EVERY_N_WORKOUTS` sessions. A deload here is not a week off: it is
 * the same sessions run at 3-4 RIR, which sheds accumulated fatigue without
 * losing the groove on any lift.
 */

import type { Workout } from "./types";

/**
 * Sessions between deloads. At three sessions a week, 7 workouts is a deload
 * roughly every two and a half weeks; 21 would be every seventh week.
 * This is the only number to change.
 */
export const DELOAD_EVERY_N_WORKOUTS = 7;

export interface DeloadStatus {
  /** Workouts logged since the last deload point. */
  sinceDeload: number;
  /** Workouts still to go before the next one. */
  remaining: number;
  /** True when the next session should be the deload. */
  due: boolean;
  message: string;
}

export function deloadStatus(
  workouts: Workout[],
  every: number = DELOAD_EVERY_N_WORKOUTS,
): DeloadStatus {
  const total = workouts.length;
  // After 7 workouts the 8th is the deload, so `sinceDeload` cycles 0..every-1.
  const sinceDeload = every > 0 ? total % every : 0;
  const due = total > 0 && sinceDeload === 0;
  const remaining = due ? 0 : every - sinceDeload;

  return {
    sinceDeload,
    remaining,
    due,
    message: due
      ? `Deload this session. You have logged ${total} workouts. Run the same exercises at 3–4 RIR — roughly two-thirds of your usual load, every set well short of failure. Do not skip it and do not chase reps.`
      : `${remaining} workout${remaining === 1 ? "" : "s"} until your next deload.`,
  };
}
