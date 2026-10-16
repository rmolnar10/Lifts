"use client";

import { exercisesForDay } from "@/lib/activeProgram";
import { planNext } from "@/lib/engine";
import { calcPRs, totalVolume } from "@/lib/stats";
import { deloadStatus } from "@/lib/deload";
import type { SharedViewProps } from "@/components/AppShell";
import BodyweightCard from "@/components/BodyweightCard";

interface Props extends SharedViewProps {
  onStartWorkout: (day: string) => void;
}

export default function Dashboard({
  state,
  day,
  setDay,
  program,
  onStartWorkout,
  refresh,
  setError,
}: Props) {
  const { workouts, starts } = state;
  const volume = totalVolume(workouts);
  const last = workouts.length ? workouts[workouts.length - 1] : null;
  const deload = deloadStatus(workouts, program);

  return (
    <>
      {deload.due ? (
        <div className="notice warn">
          <strong>Deload session.</strong> {deload.message}
        </div>
      ) : null}
      <div className="stats">
        <div className="stat">
          <div className="num">{workouts.length}</div>
          <div className="label">Workouts</div>
        </div>
        <div className="stat">
          <div className="num">{calcPRs(workouts, program).length}</div>
          <div className="label">PR entries</div>
        </div>
        <div className="stat">
          <div className="num">{Math.round(volume).toLocaleString()}</div>
          <div className="label">Logged load×reps</div>
        </div>
        <div className="stat">
          <div className="num">{last ? new Date(last.date).toLocaleDateString() : "—"}</div>
          <div className="label">Last workout</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2>Next workout</h2>
        <div className="tabs">
          {program.dayOrder.map((d) => (
            <button key={d} className={day === d ? "active" : ""} onClick={() => setDay(d)}>
              {d}
            </button>
          ))}
        </div>
        {exercisesForDay(program, day).map((exercise) => {
          const s = planNext(exercise, day, workouts, starts, { bodyweight: state.bodyweight });
          return (
            <div className="target" key={exercise.id}>
              <b>{exercise.name}</b> — {s.target}
              <br />
              <span className="small">{s.focus}</span>
            </div>
          );
        })}
        <div className="actions">
          <button className="primary" onClick={() => onStartWorkout(day)}>
            Start workout
          </button>
        </div>
      </div>

      <BodyweightCard
        entries={state.bodyweight ?? []}
        available={state.v6Inputs !== false}
        refresh={refresh}
        setError={setError}
      />

      <div className="grid">
        <div className="card">
          <h3>Recent workouts</h3>
          {workouts.length ? (
            workouts
              .slice(-6)
              .reverse()
              .map((w) => (
                <div className="pr" key={w.id}>
                  <span>{w.day}</span>
                  <span className="muted">{new Date(w.date).toLocaleDateString()}</span>
                </div>
              ))
          ) : (
            <div className="muted">No workouts yet.</div>
          )}
        </div>
        <div className="card">
          <h3>Training focus</h3>
          <p className="muted">
            {workouts.length
              ? "Keep compounds controlled and close to failure without forcing ugly reps. Tap how you feel at the start and whether form held on each lift: the targets adapt to both."
              : "Enter starting weights and complete your first workout to establish baselines."}
          </p>
        </div>
      </div>
    </>
  );
}
