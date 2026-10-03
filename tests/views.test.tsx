/**
 * Render smoke tests: every V4 view is rendered to HTML with real data so a
 * crash, a missing target or a broken derived metric fails the build.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { writeDraft, type WorkoutDraft } from "@/lib/draft";
import { builtinActiveProgram } from "./helpers";
import { PROGRAM } from "@/lib/program";
import Dashboard from "@/components/views/Dashboard";
import WorkoutView from "@/components/views/WorkoutView";
import HistoryView from "@/components/views/HistoryView";
import ProgressView from "@/components/views/ProgressView";
import PRsView from "@/components/views/PRsView";
import SettingsView from "@/components/views/SettingsView";
import { startKey } from "@/lib/program";
import type { AppState, Workout } from "@/lib/types";

const HEAVY = "Heavy Upper";

const workouts: Workout[] = [
  {
    id: "w1",
    day: HEAVY,
    date: "2026-01-05T10:00:00.000Z",
    exercises: {
      bench: { name: "Bench Press", reps: [8, 7, 6, 6], weight: 135, unit: "lb", rir: 2 },
      curl: { name: "Curl", reps: [12, 11, 10], weight: 30, unit: "lb", rir: null },
    },
    notes: "good session",
  },
  {
    id: "w2",
    day: HEAVY,
    date: "2026-01-12T10:00:00.000Z",
    exercises: {
      bench: { name: "Bench Press", reps: [8, 8, 8, 8], weight: 140, unit: "lb", rir: 1 },
    },
    notes: "",
  },
];

const state: AppState = {
  starts: { [startKey(HEAVY, "bench")]: 135 },
  workouts,
};

const PROG = builtinActiveProgram();

const shared = {
  program: PROG,
  programs: [
    { id: PROG.id, slug: PROG.slug, name: PROG.name, notes: "", weeks: null },
  ],
  onProgramsChanged: async () => undefined,
  state,
  day: HEAVY,
  setDay: () => undefined,
  refresh: async () => undefined,
  startRest: () => undefined,
  setView: () => undefined,
  setError: () => undefined,
};

/** In-memory localStorage so draft restore can be exercised in a render test. */
function installStorage() {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
    },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("view rendering", () => {
  it("dashboard shows stats and the next target for every exercise", () => {
    const html = renderToStaticMarkup(<Dashboard {...shared} onStartWorkout={() => undefined} />);
    expect(html).toContain("Workouts");
    expect(html).toContain("Logged load×reps");
    // Two workouts logged, and bench hit 8/8/8/8 last time, so the load goes up.
    expect(html).toContain("145 lb × 5–8");
    expect(html).toContain("All sets reached 8. Increase load.");
    expect(html).toContain("Start workout");
  });

  it("workout view renders an input for every set of every exercise", () => {
    const html = renderToStaticMarkup(
      <WorkoutView {...shared} editingId={null} setEditingId={() => undefined} onDone={() => undefined} account="test@example.com" />,
    );
    expect(html).toContain("Bench Press");
    expect(html).toContain('id="r-bench-3"'); // 4 sets, zero-indexed
    expect(html).toContain('id="w-bench"');
    expect(html).toContain('id="rir-bench"');
    expect(html).toContain("Finish &amp; save workout");
    // Non-loaded exercises must not offer a weight field.
    expect(html).not.toContain('id="w-rk"');
  });

  it("workout view in edit mode loads the saved values and hides next targets", () => {
    const html = renderToStaticMarkup(
      <WorkoutView {...shared} editingId="w1" setEditingId={() => undefined} onDone={() => undefined} account="test@example.com" />,
    );
    expect(html).toContain("Save changes");
    expect(html).toContain("good session");
    expect(html).toContain('value="135"');
    expect(html).not.toContain("Next target");
  });

  it("history lists workouts newest first with edit and delete", () => {
    const html = renderToStaticMarkup(<HistoryView {...shared} onEdit={() => undefined} />);
    expect(html).toContain("Workout history");
    expect(html).toContain("Edit");
    expect(html).toContain("Delete");
    expect(html.indexOf("1/12/2026")).toBeLessThan(html.indexOf("1/5/2026"));
  });

  it("progress shows the charts, the table and estimated 1RM", () => {
    const html = renderToStaticMarkup(<ProgressView state={state} program={PROG} />);
    expect(html).toContain("Est. 1RM");
    expect(html).toContain("Bench Press");
    // Epley on 140 x 8 -> 177
    expect(html).toContain("177");
    // Both charts render, each labelled for screen readers.
    expect(html).toContain("Reps per set for Bench Press");
    expect(html).toContain("Working load for Bench Press");
  });

  it("progress tells you what to change next, not just what happened", () => {
    const html = renderToStaticMarkup(<ProgressView state={state} program={PROG} />);
    expect(html).toContain("What to change next session");
    // 140 x 8/8/8/8 tops out the 5-8 range, so the next step is +5 lb.
    expect(html).toContain("Go to 145 lb next session");
    expect(html).toContain("Add load");
  });

  it("progress draws the rep-range line every set has to clear", () => {
    const html = renderToStaticMarkup(<ProgressView state={state} program={PROG} />);
    expect(html).toContain("every set must reach this to add load");
    expect(html).toContain("until your next deload");
  });

  it("PRs list load and rep records", () => {
    const html = renderToStaticMarkup(<PRsView state={state} program={PROG} />);
    expect(html).toContain("Personal records");
    expect(html).toContain("140 lb");
    expect(html).toContain("Load PR");
    expect(html).toContain("Rep PR");
  });

  it("settings offers starting weights, backup and reset", () => {
    const html = renderToStaticMarkup(<SettingsView {...shared} />);
    expect(html).toContain("Starting weights");
    expect(html).toContain("Export backup");
    expect(html).toContain("Import backup");
    expect(html).toContain("Reset data");
    expect(html).toContain('value="135"');
    // Practice/timed movements have no starting weight field.
    expect(html).not.toContain("Reverse Kegel Practice");
  });

  it("restores an in-progress workout from a saved draft", () => {
    installStorage();

    const forms: WorkoutDraft["forms"] = {};
    for (const exercise of PROGRAM[HEAVY]) {
      forms[exercise.id] = {
        weight: "225",
        rir: "1",
        reps: Array.from({ length: exercise.sets }, () => "11"),
      };
    }
    writeDraft("test@example.com", PROG.id, null, {
      savedAt: new Date().toISOString(),
      day: HEAVY,
      forms,
      notes: "half way through",
    });

    const html = renderToStaticMarkup(
      <WorkoutView
        {...shared}
        editingId={null}
        setEditingId={() => undefined}
        onDone={() => undefined}
        account="test@example.com"
      />,
    );

    // Draft values win over the computed defaults.
    expect(html).toContain('value="225"');
    expect(html).toContain('value="11"');
    expect(html).toContain("half way through");
    expect(html).toContain("Picked up where you left off");
    expect(html).toContain("Start fresh");
  });

  it("shows no restore banner when there is no draft", () => {
    installStorage();
    const html = renderToStaticMarkup(
      <WorkoutView
        {...shared}
        editingId={null}
        setEditingId={() => undefined}
        onDone={() => undefined}
        account="test@example.com"
      />,
    );
    expect(html).not.toContain("Picked up where you left off");
    expect(html).toContain('value="140"'); // last session's bench load
  });

  it("renders every view with no data at all", () => {
    const empty: AppState = { starts: {}, workouts: [] };
    const base = { ...shared, state: empty };
    expect(renderToStaticMarkup(<Dashboard {...base} onStartWorkout={() => undefined} />)).toContain(
      "No workouts yet.",
    );
    expect(renderToStaticMarkup(<HistoryView {...base} onEdit={() => undefined} />)).toContain(
      "No workouts yet.",
    );
    expect(renderToStaticMarkup(<ProgressView state={empty} program={PROG} />)).toContain("No history yet.");
    expect(renderToStaticMarkup(<PRsView state={empty} program={PROG} />)).toContain(
      "Complete workouts to create PRs.",
    );
    expect(
      renderToStaticMarkup(
        <WorkoutView {...base} editingId={null} setEditingId={() => undefined} onDone={() => undefined} account="test@example.com" />,
      ),
    ).toContain("Enter starting lb");
  });
});
