import { describe, expect, it } from "vitest";
import { PROGRAM } from "@/lib/program";
import { retiredExercisePayloads } from "@/lib/retired";
import type { Workout } from "@/lib/types";

const VOLUME = "Volume Upper";

/** A real Volume Upper session logged before close-grip push-ups were replaced. */
const legacyWorkout: Workout = {
  id: "w-old",
  day: VOLUME,
  date: "2026-08-20T10:00:00.000Z",
  notes: "logged under the old program",
  exercises: {
    incline: { name: "Incline DB Press", reps: [10, 9, 9, 8], weight: 50, unit: "lb", rir: 2 },
    pull: { name: "Pull-Up", reps: [8, 7, 6], weight: 0, unit: "reps", rir: 1 },
    pushup: { name: "Close-Grip Push-Ups", reps: [20, 16], weight: 0, unit: "reps", rir: 0 },
  },
};

describe("exercises removed from the program", () => {
  it("keeps a retired exercise's performance when the workout is re-saved", () => {
    const carried = retiredExercisePayloads(VOLUME, legacyWorkout);

    expect(carried).toHaveLength(1);
    expect(carried[0]).toEqual({
      exercise_id: "pushup",
      name: "Close-Grip Push-Ups",
      weight: 0,
      unit: "reps",
      rir: 0,
      reps: [20, 16],
    });
  });

  it("does not duplicate exercises the program still has", () => {
    const ids = retiredExercisePayloads(VOLUME, legacyWorkout).map((e) => e.exercise_id);
    for (const exercise of PROGRAM[VOLUME]) {
      expect(ids).not.toContain(exercise.id);
    }
  });

  it("returns nothing for a workout that matches the current program", () => {
    const current: Workout = {
      ...legacyWorkout,
      exercises: Object.fromEntries(
        PROGRAM[VOLUME].map((e) => [
          e.id,
          { name: e.name, reps: [1], weight: 0, unit: e.unit, rir: null },
        ]),
      ),
    };
    expect(retiredExercisePayloads(VOLUME, current)).toEqual([]);
  });

  it("returns nothing when logging a new workout rather than editing", () => {
    expect(retiredExercisePayloads(VOLUME, null)).toEqual([]);
  });

  it("survives an unknown day without throwing", () => {
    expect(retiredExercisePayloads("Nonexistent Day", legacyWorkout)).toHaveLength(3);
  });
});
