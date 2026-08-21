/**
 * Render smoke tests: every V4 view is rendered to HTML with real data so a
 * crash, a missing target or a broken derived metric fails the build.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

const shared = {
  state,
  day: HEAVY,
  setDay: () => undefined,
  refresh: async () => undefined,
  startRest: () => undefined,
  setView: () => undefined,
  setError: () => undefined,
};

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
      <WorkoutView {...shared} editingId={null} setEditingId={() => undefined} onDone={() => undefined} />,
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
      <WorkoutView {...shared} editingId="w1" setEditingId={() => undefined} onDone={() => undefined} />,
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

  it("progress shows the load trend and estimated 1RM", () => {
    const html = renderToStaticMarkup(<ProgressView state={state} />);
    expect(html).toContain("load trend");
    expect(html).toContain("Est. 1RM");
    expect(html).toContain("Bench Press");
    // Epley on 140 x 8 -> 177
    expect(html).toContain("177");
  });

  it("PRs list load and rep records", () => {
    const html = renderToStaticMarkup(<PRsView state={state} />);
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

  it("renders every view with no data at all", () => {
    const empty: AppState = { starts: {}, workouts: [] };
    const base = { ...shared, state: empty };
    expect(renderToStaticMarkup(<Dashboard {...base} onStartWorkout={() => undefined} />)).toContain(
      "No workouts yet.",
    );
    expect(renderToStaticMarkup(<HistoryView {...base} onEdit={() => undefined} />)).toContain(
      "No workouts yet.",
    );
    expect(renderToStaticMarkup(<ProgressView state={empty} />)).toContain("No history yet.");
    expect(renderToStaticMarkup(<PRsView state={empty} />)).toContain(
      "Complete workouts to create PRs.",
    );
    expect(
      renderToStaticMarkup(
        <WorkoutView {...base} editingId={null} setEditingId={() => undefined} onDone={() => undefined} />,
      ),
    ).toContain("Enter starting lb");
  });
});
