import { PROGRAM, type Exercise } from "@/lib/program";
import type { ActiveProgram } from "@/lib/activeProgram";
import type { LoggedExercise, Workout } from "@/lib/types";

let counter = 0;

/** Builds a saved workout containing a single exercise performance. */
export function workout(
  day: string,
  exerciseId: string,
  performance: Partial<LoggedExercise> & { reps: number[] },
  date?: string,
): Workout {
  counter += 1;
  return {
    id: `w${counter}`,
    day,
    date: date ?? new Date(2026, 0, counter).toISOString(),
    exercises: {
      [exerciseId]: {
        name: performance.name ?? exerciseId,
        reps: performance.reps,
        weight: performance.weight ?? 0,
        unit: performance.unit ?? "lb",
        rir: performance.rir ?? null,
      },
    },
    notes: "",
  };
}

/** Repeatedly applies the engine's target reps until the load increases. */
export function repsFromTarget(target: string): number[] | null {
  const match = target.match(/×\s*(.+)$/);
  if (!match) return null;
  const parts = match[1].split("/").map((p) => p.trim());
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.map(Number);
}

export function exerciseById(list: Exercise[], id: string): Exercise {
  const found = list.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown exercise ${id}`);
  return found;
}

/**
 * The built-in program as the app now sees it: resolved from the PROGRAM
 * constant into the shape views and helpers consume.
 */
export function builtinActiveProgram(): ActiveProgram {
  return {
    id: "00000000-0000-0000-0000-0000000000aa",
    slug: "lifts-3day",
    name: "Lifts 3-Day",
    weeks: null,
    week: 1,
    blockName: "Ongoing",
    hasWeeks: false,
    dayOrder: Object.keys(PROGRAM),
    days: PROGRAM,
  };
}
