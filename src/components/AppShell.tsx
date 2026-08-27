"use client";

import { useCallback, useEffect, useState } from "react";
import { DAYS } from "@/lib/program";
import { loadState } from "@/lib/data";
import { EMPTY_STATE, type AppState } from "@/lib/types";
import Dashboard from "@/components/views/Dashboard";
import WorkoutView from "@/components/views/WorkoutView";
import HistoryView from "@/components/views/HistoryView";
import ProgressView from "@/components/views/ProgressView";
import PRsView from "@/components/views/PRsView";
import SettingsView from "@/components/views/SettingsView";
import RestTimer from "@/components/RestTimer";
import LegacyImportBanner from "@/components/LegacyImportBanner";

export const VIEWS = ["Dashboard", "Workout", "History", "Progress", "PRs", "Settings"] as const;
export type ViewName = (typeof VIEWS)[number];

export default function AppShell({ userEmail }: { userEmail: string }) {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [view, setView] = useState<ViewName>("Dashboard");
  const [day, setDay] = useState<string>(DAYS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await loadState());
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not load your data: ${e.message}`
          : "Could not load your data.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Re-sync when the tab regains focus, so a workout logged on the phone shows
  // up on the computer without a manual reload.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === "visible") void refresh();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const startRest = useCallback((seconds: number) => {
    if (!seconds) return;
    setRestEndsAt(Date.now() + seconds * 1000);
  }, []);

  function goToWorkout(nextDay: string, workoutId: string | null = null) {
    setDay(nextDay);
    setEditingId(workoutId);
    setView("Workout");
  }

  const shared = { state, day, setDay, refresh, startRest, setView, setError };

  return (
    <>
      <div className="wrap">
        <header>
          <div>
            <h1>Lift Progression Tracker</h1>
            <div className="muted">V5 — cloud sync, fast logging, RIR, notes, editing</div>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <span className="sync">{userEmail}</span>
            <form action="/auth/signout" method="post">
              <button type="submit">Sign out</button>
            </form>
          </div>
        </header>

        <div className="nav">
          {VIEWS.map((name) => (
            <button
              key={name}
              className={view === name ? "active" : ""}
              onClick={() => {
                setEditingId(null);
                setView(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <div className="card muted">Loading your training data…</div>
        ) : (
          <>
            <LegacyImportBanner state={state} refresh={refresh} />

            {view === "Dashboard" ? (
              <Dashboard {...shared} onStartWorkout={(d) => goToWorkout(d)} />
            ) : null}

            {view === "Workout" ? (
              <WorkoutView
                key={`${day}:${editingId ?? "new"}`}
                {...shared}
                editingId={editingId}
                setEditingId={setEditingId}
                account={userEmail}
                onDone={() => {
                  setEditingId(null);
                  setView("Dashboard");
                }}
              />
            ) : null}

            {view === "History" ? (
              <HistoryView {...shared} onEdit={(d, id) => goToWorkout(d, id)} />
            ) : null}

            {view === "Progress" ? <ProgressView state={state} /> : null}
            {view === "PRs" ? <PRsView state={state} /> : null}
            {view === "Settings" ? <SettingsView {...shared} /> : null}
          </>
        )}
      </div>

      <RestTimer endsAt={restEndsAt} onStop={() => setRestEndsAt(null)} />
    </>
  );
}

/** Props every view shares. */
export interface SharedViewProps {
  state: AppState;
  day: string;
  setDay: (day: string) => void;
  refresh: () => Promise<void>;
  startRest: (seconds: number) => void;
  setView: (view: ViewName) => void;
  setError: (error: string | null) => void;
}
