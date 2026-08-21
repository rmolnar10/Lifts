import { describe, expect, it } from "vitest";
import { BACKUP_VERSION, parseBackup, serialiseBackup } from "@/lib/backup";
import type { AppState } from "@/lib/types";

/** A backup exported by the V4 prototype, including its numeric workout ids. */
const V4_BACKUP = JSON.stringify({
  version: 4,
  starts: { "Heavy Upper::bench": 135, "Legs + Abs::squat": "", "Volume Upper::incline": 50 },
  workouts: [
    {
      id: 1735689600000,
      day: "Heavy Upper",
      date: "2026-01-01T10:00:00.000Z",
      exercises: {
        bench: { name: "Bench Press", reps: [8, 7, 6, 6], weight: 135, unit: "lb", rir: 2 },
        curl: { name: "Curl", reps: [12, 11, 10], weight: 30, unit: "lb", rir: null },
      },
      notes: "solid session",
    },
    {
      id: 1735776000000,
      day: "Legs + Abs",
      date: "2026-01-02T10:00:00.000Z",
      exercises: {
        sideplank: { name: "Side Plank", reps: [45, 40], weight: 0, unit: "sec", rir: null },
      },
      notes: "",
    },
  ],
});

describe("parseBackup", () => {
  it("reads a V4 backup without losing anything", () => {
    const state = parseBackup(V4_BACKUP);

    expect(state.workouts).toHaveLength(2);
    expect(state.starts["Heavy Upper::bench"]).toBe(135);
    expect(state.starts["Legs + Abs::squat"]).toBe("");

    const first = state.workouts[0];
    expect(first.day).toBe("Heavy Upper");
    expect(first.notes).toBe("solid session");
    expect(first.exercises.bench).toEqual({
      name: "Bench Press",
      reps: [8, 7, 6, 6],
      weight: 135,
      unit: "lb",
      rir: 2,
    });
    expect(first.exercises.curl.rir).toBeNull();
    expect(state.workouts[1].exercises.sideplank.unit).toBe("sec");
  });

  it("sorts workouts oldest first so progression reads the latest one", () => {
    const state = parseBackup(
      JSON.stringify({
        starts: {},
        workouts: [
          { day: "Heavy Upper", date: "2026-03-01T00:00:00.000Z", exercises: {} },
          { day: "Heavy Upper", date: "2026-01-01T00:00:00.000Z", exercises: {} },
        ],
      }),
    );
    expect(state.workouts.map((w) => w.date)).toEqual([
      "2026-01-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z",
    ]);
  });

  it("rejects files that are not lift tracker backups", () => {
    const message = "That file is not a valid lift tracker backup.";
    expect(() => parseBackup("not json")).toThrow(message);
    expect(() => parseBackup("{}")).toThrow(message);
    expect(() => parseBackup(JSON.stringify({ starts: {} }))).toThrow(message);
    expect(() => parseBackup(JSON.stringify({ workouts: [] }))).toThrow(message);
    expect(() => parseBackup(JSON.stringify([1, 2, 3]))).toThrow(message);
  });

  it("coerces string reps and weights written by older exports", () => {
    const state = parseBackup(
      JSON.stringify({
        starts: { "Heavy Upper::bench": "135" },
        workouts: [
          {
            day: "Heavy Upper",
            date: "2026-01-01T00:00:00.000Z",
            exercises: { bench: { name: "Bench Press", reps: ["8", "7"], weight: "135" } },
          },
        ],
      }),
    );
    expect(state.starts["Heavy Upper::bench"]).toBe(135);
    expect(state.workouts[0].exercises.bench.reps).toEqual([8, 7]);
    expect(state.workouts[0].exercises.bench.weight).toBe(135);
    expect(state.workouts[0].exercises.bench.rir).toBeNull();
  });

  it("drops entries that are not workouts instead of failing the whole import", () => {
    const state = parseBackup(
      JSON.stringify({ starts: {}, workouts: [null, { noDay: true }, { day: "Heavy Upper" }] }),
    );
    expect(state.workouts).toHaveLength(1);
    expect(state.workouts[0].day).toBe("Heavy Upper");
  });
});

describe("serialiseBackup", () => {
  it("round-trips through export and import", () => {
    const state: AppState = parseBackup(V4_BACKUP);
    const roundTripped = parseBackup(serialiseBackup(state));
    expect(roundTripped).toEqual(state);
  });

  it("stamps the current backup version", () => {
    const exported = JSON.parse(serialiseBackup({ starts: {}, workouts: [] }));
    expect(exported.version).toBe(BACKUP_VERSION);
    expect(exported).toHaveProperty("starts");
    expect(exported).toHaveProperty("workouts");
  });
});
