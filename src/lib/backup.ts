/**
 * JSON backup format, kept compatible with the V4 export so an existing
 * `lift-tracker-backup.json` imports straight into the cloud.
 */

import type { Unit } from "./program";
import type { AppState, LoggedExercise, StartingWeights, Workout } from "./types";

export const BACKUP_VERSION = 5;

export interface BackupFile {
  version: number;
  starts: StartingWeights;
  workouts: Workout[];
}

/** Keys the V4/V3/V2 prototypes used in localStorage, newest first. */
export const LEGACY_STORAGE_KEYS = ["liftTrackerV4", "liftTrackerV3", "liftTrackerV2"];

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseExercise(raw: unknown): LoggedExercise | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Record<string, unknown>;
  const reps = Array.isArray(x.reps) ? x.reps.map((r) => toNumber(r)) : [];
  const rir = x.rir === null || x.rir === undefined || x.rir === "" ? null : toNumber(x.rir);
  return {
    name: typeof x.name === "string" ? x.name : "",
    reps,
    weight: toNumber(x.weight),
    unit: (typeof x.unit === "string" ? x.unit : "lb") as Unit,
    rir,
  };
}

function normaliseWorkout(raw: unknown): Workout | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (typeof w.day !== "string" || !w.day) return null;

  const exercises: Record<string, LoggedExercise> = {};
  if (w.exercises && typeof w.exercises === "object") {
    for (const [id, value] of Object.entries(w.exercises as Record<string, unknown>)) {
      const exercise = normaliseExercise(value);
      if (exercise) exercises[id] = exercise;
    }
  }

  const parsedDate = w.date ? new Date(String(w.date)) : new Date();
  const date = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  return {
    id: String(w.id ?? ""),
    day: w.day,
    date,
    exercises,
    notes: typeof w.notes === "string" ? w.notes : "",
  };
}

function normaliseStarts(raw: unknown): StartingWeights {
  const starts: StartingWeights = {};
  if (!raw || typeof raw !== "object") return starts;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === "" || value === null || value === undefined) {
      starts[key] = "";
    } else {
      const n = Number(value);
      if (Number.isFinite(n)) starts[key] = n;
    }
  }
  return starts;
}

/**
 * Parses a V2–V5 backup file. Throws when the payload is not a lift tracker
 * backup, matching the V4 behaviour of rejecting unknown files outright.
 */
export function parseBackup(text: string): AppState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file is not a valid lift tracker backup.");
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("That file is not a valid lift tracker backup.");
  }

  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.workouts) || !data.starts || typeof data.starts !== "object") {
    throw new Error("That file is not a valid lift tracker backup.");
  }

  const workouts = data.workouts
    .map(normaliseWorkout)
    .filter((w): w is Workout => w !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { starts: normaliseStarts(data.starts), workouts };
}

export function serialiseBackup(state: AppState): string {
  const file: BackupFile = {
    version: BACKUP_VERSION,
    starts: state.starts,
    workouts: state.workouts,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Reads data left behind by the V2/V3/V4 browser-only versions, so it can be
 * uploaded into the user's cloud account once. Returns null when there is none.
 */
export function readLegacyLocalData(): { key: string; state: AppState } | null {
  if (typeof window === "undefined") return null;
  for (const key of LEGACY_STORAGE_KEYS) {
    let text: string | null = null;
    try {
      text = window.localStorage.getItem(key);
    } catch {
      return null; // Storage blocked (private mode); nothing to migrate.
    }
    if (!text) continue;
    try {
      const state = parseBackup(text);
      if (state.workouts.length || Object.keys(state.starts).length) {
        return { key, state };
      }
    } catch {
      // Not readable as a backup — skip this key.
    }
  }
  return null;
}

export function clearLegacyLocalData(): void {
  if (typeof window === "undefined") return;
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore: clearing is a convenience, not a requirement.
  }
}
