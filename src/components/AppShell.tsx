"use client";

import { useCallback, useEffect, useState } from "react";
import { loadState } from "@/lib/data";
import { EMPTY_STATE, type AppState } from "@/lib/types";
import {
  blockForWeek,
  ensurePrograms,
  listPrograms,
  loadProgram,
  setActiveProgram,
  type ProgramSummary,
} from "@/lib/programs";
import { defaultDay, type ActiveProgram } from "@/lib/activeProgram";
import ProgramPicker from "@/components/ProgramPicker";
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
  const [day, setDay] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [program, setProgram] = useState<ActiveProgram | null>(null);
  const [week, setWeek] = useState(1);

  /** Resolves a program id plus a week into the days and exercises to show. */
  const openProgram = useCallback(async (programId: string, atWeek: number) => {
    const loaded = await loadProgram(programId);
    const block = blockForWeek(loaded, atWeek);
    const hasWeeks = loaded.blocks.length > 1 || loaded.blocks.some((b) => b.weekEnd !== null);
    const active: ActiveProgram = {
      id: loaded.id,
      slug: loaded.slug,
      name: loaded.name,
      weeks: loaded.weeks,
      week: atWeek,
      blockName: block?.name ?? "",
      hasWeeks,
      dayOrder: block?.dayOrder ?? [],
      days: block?.days ?? {},
    };
    setProgram(active);
    setDay((current) => (current && active.days[current] ? current : defaultDay(active)));
    return active;
  }, []);

  const refresh = useCallback(async (programId?: string) => {
    const id = programId ?? program?.id;
    if (!id) return;
    try {
      setState(await loadState(id));
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not load your data: ${e.message}`
          : "Could not load your data.",
      );
    }
  }, [program?.id]);

  // First load: make sure the account has the built-in program, adopt any
  // history that predates programs, then open whichever is active.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { programs: list, activeId } = await ensurePrograms();
        if (cancelled) return;
        setPrograms(list);
        await openProgram(activeId, 1);
        if (!cancelled) await loadState(activeId).then(setState);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? `Could not load your programs: ${e.message}`
              : "Could not load your programs.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openProgram]);

  const reloadPrograms = useCallback(async () => {
    setPrograms(await listPrograms());
  }, []);

  async function switchProgram(programId: string) {
    setLoading(true);
    setEditingId(null);
    setView("Dashboard");
    try {
      await setActiveProgram(programId);
      setWeek(1);
      await openProgram(programId, 1);
      setState(await loadState(programId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? `Could not switch program: ${e.message}` : "Could not switch program.");
    } finally {
      setLoading(false);
    }
  }

  async function changeWeek(next: number) {
    if (!program) return;
    setWeek(next);
    setEditingId(null);
    await openProgram(program.id, next);
  }

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

  const shared = {
    state,
    day,
    setDay,
    refresh: () => refresh(),
    startRest,
    setView,
    setError,
    program: program as ActiveProgram,
    programs,
    onProgramsChanged: reloadPrograms,
  };

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

        {loading || !program ? (
          <div className="card muted">Loading your training data…</div>
        ) : (
          <>
            <ProgramPicker
              programs={programs}
              program={program}
              week={week}
              onSwitch={switchProgram}
              onWeekChange={changeWeek}
            />

            <LegacyImportBanner state={state} refresh={() => refresh()} programId={program.id} />

            {view === "Dashboard" ? (
              <Dashboard {...shared} onStartWorkout={(d) => goToWorkout(d)} />
            ) : null}

            {view === "Workout" ? (
              <WorkoutView
                key={`${program.id}:${program.week}:${day}:${editingId ?? "new"}`}
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

            {view === "Progress" ? <ProgressView state={state} program={program} /> : null}
            {view === "PRs" ? <PRsView state={state} program={program} /> : null}
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
  program: ActiveProgram;
  programs: ProgramSummary[];
  onProgramsChanged: () => Promise<void>;
}
