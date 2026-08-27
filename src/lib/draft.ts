"use client";

/**
 * In-progress workout drafts.
 *
 * Switching tabs unmounts the workout form, and a phone can lock, evict the tab
 * or lose the browser entirely mid-session. Drafts are mirrored into
 * localStorage on every keystroke so none of that loses a half-logged workout.
 *
 * Drafts are deliberately local-only: an unfinished workout is scratch state,
 * not something to sync across devices or put in the database.
 */

import { PROGRAM } from "./program";

/** Bump when the stored shape changes so old drafts are ignored rather than misread. */
const DRAFT_VERSION = 1;
const KEY_PREFIX = `lifts:draft:v${DRAFT_VERSION}`;

/** Drafts older than this are treated as abandoned. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface DraftForm {
  weight: string;
  rir: string;
  reps: string[];
}

export interface WorkoutDraft {
  savedAt: string;
  day: string;
  forms: Record<string, DraftForm>;
  notes: string;
}

/**
 * One draft per account, per day, per edit target — so logging Heavy Upper does
 * not clobber a half-finished Legs day, and two accounts sharing a browser stay
 * separate.
 */
export function draftKey(account: string, day: string, editingId: string | null): string {
  return `${KEY_PREFIX}:${account}:${editingId ?? "new"}:${day}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // Private mode or blocked storage.
  }
}

/**
 * A draft is only usable if it still matches the program: same exercises, same
 * set counts. If the program changes underneath it, discard rather than
 * rendering a form with missing or extra rows.
 */
function matchesProgram(draft: WorkoutDraft): boolean {
  const exercises = PROGRAM[draft.day];
  if (!exercises) return false;
  return exercises.every((exercise) => {
    const form = draft.forms[exercise.id];
    return (
      form !== undefined &&
      Array.isArray(form.reps) &&
      form.reps.length === exercise.sets &&
      typeof form.weight === "string" &&
      typeof form.rir === "string"
    );
  });
}

export function readDraft(
  account: string,
  day: string,
  editingId: string | null,
  now: number = Date.now(),
): WorkoutDraft | null {
  const store = storage();
  if (!store) return null;

  const key = draftKey(account, day, editingId);
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let draft: WorkoutDraft;
  try {
    draft = JSON.parse(raw) as WorkoutDraft;
  } catch {
    clearDraft(account, day, editingId);
    return null;
  }

  const savedAt = Date.parse(draft?.savedAt ?? "");
  if (!draft || typeof draft !== "object" || Number.isNaN(savedAt)) {
    clearDraft(account, day, editingId);
    return null;
  }

  if (now - savedAt > DRAFT_MAX_AGE_MS || !matchesProgram(draft)) {
    clearDraft(account, day, editingId);
    return null;
  }

  return draft;
}

export function writeDraft(
  account: string,
  editingId: string | null,
  draft: WorkoutDraft,
): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(draftKey(account, draft.day, editingId), JSON.stringify(draft));
  } catch {
    // Quota exceeded or blocked — losing the draft mirror is not worth breaking
    // the workout the user is in the middle of logging.
  }
}

export function clearDraft(account: string, day: string, editingId: string | null): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(draftKey(account, day, editingId));
  } catch {
    // Ignore.
  }
}

/** Human-readable "when did I last touch this" for the restore banner. */
export function describeAge(savedAt: string, now: number = Date.now()): string {
  const then = Date.parse(savedAt);
  if (Number.isNaN(then)) return "earlier";

  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
