import { beforeEach, describe, expect, it } from "vitest";
import {
  DRAFT_MAX_AGE_MS,
  clearDraft,
  describeAge,
  draftKey,
  readDraft,
  writeDraft,
  type WorkoutDraft,
} from "@/lib/draft";
import { PROGRAM } from "@/lib/program";
import { builtinActiveProgram } from "./helpers";

/** Minimal in-memory localStorage so the module under test behaves as in a browser. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

const HEAVY = "Heavy Upper";
const ACCOUNT = "lifter@example.com";
const PROG = builtinActiveProgram();

function fullDraft(overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  const forms: WorkoutDraft["forms"] = {};
  for (const exercise of PROGRAM[HEAVY]) {
    forms[exercise.id] = {
      weight: "135",
      rir: "2",
      reps: Array.from({ length: exercise.sets }, () => "8"),
    };
  }
  return { savedAt: new Date().toISOString(), day: HEAVY, forms, notes: "", ...overrides };
}

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
    writable: true,
  });
});

describe("draft round-trip", () => {
  it("saves and restores an in-progress workout", () => {
    const draft = fullDraft({ notes: "felt heavy" });
    writeDraft(ACCOUNT, PROG.id, null, draft);

    const restored = readDraft(ACCOUNT, PROG, HEAVY, null);
    expect(restored).not.toBeNull();
    expect(restored?.notes).toBe("felt heavy");
    expect(restored?.forms.bench.reps).toEqual(["8", "8", "8", "8"]);
  });

  it("returns null when nothing was saved", () => {
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
  });

  it("clears a draft on demand", () => {
    writeDraft(ACCOUNT, PROG.id, null, fullDraft());
    clearDraft(ACCOUNT, PROG.id, HEAVY, null);
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
  });
});

describe("draft isolation", () => {
  it("keeps drafts separate per day", () => {
    writeDraft(ACCOUNT, PROG.id, null, fullDraft({ notes: "heavy day" }));
    expect(readDraft(ACCOUNT, PROG, "Legs + Abs", null)).toBeNull();
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)?.notes).toBe("heavy day");
  });

  it("keeps drafts separate per account", () => {
    writeDraft(ACCOUNT, PROG.id, null, fullDraft({ notes: "mine" }));
    expect(readDraft("someone@else.com", PROG, HEAVY, null)).toBeNull();
  });

  it("keeps a new workout separate from an edit of a saved one", () => {
    writeDraft(ACCOUNT, PROG.id, null, fullDraft({ notes: "new session" }));
    writeDraft(ACCOUNT, PROG.id, "w1", fullDraft({ notes: "editing w1" }));

    expect(readDraft(ACCOUNT, PROG, HEAVY, null)?.notes).toBe("new session");
    expect(readDraft(ACCOUNT, PROG, HEAVY, "w1")?.notes).toBe("editing w1");
  });

  it("builds distinct keys", () => {
    expect(draftKey(ACCOUNT, PROG.id, HEAVY, null)).not.toBe(draftKey(ACCOUNT, PROG.id, HEAVY, "w1"));
    expect(draftKey(ACCOUNT, PROG.id, HEAVY, null)).not.toBe(draftKey(ACCOUNT, PROG.id, "Legs + Abs", null));
  });
});

describe("draft rejection", () => {
  it("discards a draft older than the maximum age", () => {
    const old = new Date(Date.now() - DRAFT_MAX_AGE_MS - 1000).toISOString();
    writeDraft(ACCOUNT, PROG.id, null, fullDraft({ savedAt: old }));
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
  });

  it("keeps a draft that is still within the maximum age", () => {
    const recent = new Date(Date.now() - DRAFT_MAX_AGE_MS + 60_000).toISOString();
    writeDraft(ACCOUNT, PROG.id, null, fullDraft({ savedAt: recent }));
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).not.toBeNull();
  });

  it("discards a draft whose set count no longer matches the program", () => {
    const draft = fullDraft();
    draft.forms.bench.reps = ["8", "8"]; // bench is 4 sets
    writeDraft(ACCOUNT, PROG.id, null, draft);
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
  });

  it("discards a draft that is missing an exercise", () => {
    const draft = fullDraft();
    delete draft.forms.curl;
    writeDraft(ACCOUNT, PROG.id, null, draft);
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
  });

  it("discards corrupt JSON without throwing", () => {
    window.localStorage.setItem(draftKey(ACCOUNT, PROG.id, HEAVY, null), "{not json");
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
  });

  it("discards a draft with an unparseable timestamp", () => {
    writeDraft(ACCOUNT, PROG.id, null, fullDraft({ savedAt: "not a date" }));
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
  });
});

describe("storage unavailable", () => {
  it("degrades quietly when localStorage throws", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        get localStorage(): Storage {
          throw new Error("blocked in private mode");
        },
      },
      configurable: true,
      writable: true,
    });

    expect(() => writeDraft(ACCOUNT, PROG.id, null, fullDraft())).not.toThrow();
    expect(readDraft(ACCOUNT, PROG, HEAVY, null)).toBeNull();
    expect(() => clearDraft(ACCOUNT, PROG.id, HEAVY, null)).not.toThrow();
  });
});

describe("describeAge", () => {
  const now = Date.parse("2026-08-27T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("describes recent and older saves in plain language", () => {
    expect(describeAge(ago(10_000), now)).toBe("just now");
    expect(describeAge(ago(60_000), now)).toBe("1 minute ago");
    expect(describeAge(ago(25 * 60_000), now)).toBe("25 minutes ago");
    expect(describeAge(ago(60 * 60_000), now)).toBe("1 hour ago");
    expect(describeAge(ago(5 * 60 * 60_000), now)).toBe("5 hours ago");
    expect(describeAge(ago(26 * 60 * 60_000), now)).toBe("yesterday");
    expect(describeAge(ago(3 * 24 * 60 * 60_000), now)).toBe("3 days ago");
  });

  it("falls back rather than throwing on a bad timestamp", () => {
    expect(describeAge("nonsense", now)).toBe("earlier");
  });
});
