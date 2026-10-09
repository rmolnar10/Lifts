"use client";

import { useMemo, useState } from "react";
import { UNTRACKED_TYPES } from "@/lib/program";
import { allExercisesIn, findExerciseIn, type ActiveProgram } from "@/lib/activeProgram";
import { estimatedOneRepMax } from "@/lib/stats";
import { actionItems, coachExercise, coachProgram, type ExerciseCoaching } from "@/lib/coaching";
import { deloadStatus } from "@/lib/deload";
import LoadTrendChart from "@/components/charts/LoadTrendChart";
import SetRepsChart from "@/components/charts/SetRepsChart";
import type { AppState } from "@/lib/types";

function StatusBadge({ status }: { status: ExerciseCoaching["status"] }) {
  if (status === "add-load") return <span className="badge">Add load</span>;
  if (status === "stalled") return <span className="badge warn-badge">Stalled</span>;
  if (status === "building") return <span className="badge">On track</span>;
  return null;
}

export default function ProgressView({
  state,
  program,
}: {
  state: AppState;
  program: ActiveProgram;
}) {
  const options = allExercisesIn(program).filter(({ e }) => !UNTRACKED_TYPES.includes(e.type));

  const coaching = useMemo(() => coachProgram(state, program), [state, program]);
  const todo = useMemo(() => actionItems(coaching), [coaching]);
  const deload = deloadStatus(state.workouts, program);

  // Open on something worth looking at: the lift most in need of a change,
  // else anything with history. Landing on an empty chart teaches nothing.
  const [selected, setSelected] = useState(() => {
    const best =
      todo[0] ?? coaching.find((c) => c.history.length && !UNTRACKED_TYPES.includes(c.exercise.type));
    if (best) return `${best.day}|${best.exercise.id}`;
    return options.length ? `${options[0].day}|${options[0].e.id}` : "";
  });

  const [day, exerciseId] = selected.split("|");
  const exercise = day && exerciseId ? findExerciseIn(program, day, exerciseId) : undefined;
  const detail = exercise ? coachExercise(exercise, day, state.workouts) : null;
  const rows = state.workouts.filter((w) => w.day === day && w.exercises[exerciseId]).slice(-12);

  return (
    <>
      <div className={deload.due ? "card notice warn" : "card"}>
        <h2>Progress</h2>
        <p className="small" style={{ margin: "4px 0 0" }}>
          {deload.due ? <strong>{deload.message}</strong> : deload.message}
        </p>
      </div>

      <div className="card">
        <h3>What to change next session</h3>
        {!todo.length ? (
          <p className="muted small">
            {state.workouts.length
              ? "Nothing is stalled and nothing has topped out its rep range yet. Keep adding a rep to your weakest set."
              : "Log a few workouts and this will tell you exactly what to increase."}
          </p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: "6px 0 0" }}>
            {todo.map((item) => (
              <li key={`${item.day}|${item.exercise.id}`} style={{ marginBottom: 10 }}>
                <div className="badges" style={{ marginBottom: 2 }}>
                  <strong>{item.exercise.name}</strong>
                  <StatusBadge status={item.status} />
                </div>
                <div className="small muted">
                  {item.day} — {item.headline}
                </div>
                <div className="small">{item.instruction}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>How progression works here</h3>
        <p className="small" style={{ marginTop: 4 }}>
          The load only goes up when <strong>every</strong> set reaches the top of its rep
          range — so your <em>weakest</em> set decides when you progress, not your best one.
        </p>
        <ol className="small" style={{ paddingLeft: 18, margin: "6px 0 0" }}>
          <li>
            Pick a load you can hold across all sets. Leave 1–2 reps in reserve on the early
            sets of a compound, and about 1 on isolation work.
          </li>
          <li>Take only the final set of an exercise to true failure.</li>
          <li>
            Each session, add one clean rep to the weakest set. When all sets hit the top of
            the range, add the increment and let reps reset to the bottom.
          </li>
          <li>Deload every {deload.sinceDeload + deload.remaining} workouts at 3–4 RIR.</li>
        </ol>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Taking set 1 to failure makes set 3 collapse, and set 3 is the one the app measures.
          That is the usual reason a lift sits at the same weight for weeks.
        </p>
      </div>

      <div className="card">
        <h3>Exercise detail</h3>
        <label htmlFor="progress-exercise">Exercise</label>
        <select
          id="progress-exercise"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {options.map(({ day: d, e }) => (
            <option key={`${d}|${e.id}`} value={`${d}|${e.id}`}>
              {d} — {e.name}
            </option>
          ))}
        </select>

        {!rows.length || !exercise || !detail ? (
          <div className="muted" style={{ marginTop: 12 }}>
            No history yet.
          </div>
        ) : (
          <>
            <div className="badges" style={{ marginTop: 12 }}>
              <strong>{detail.headline}</strong>
              <StatusBadge status={detail.status} />
            </div>
            <p className="small" style={{ marginTop: 4 }}>
              {detail.instruction}
            </p>

            <SetRepsChart history={detail.history} exercise={exercise} />
            <LoadTrendChart history={detail.history} exercise={exercise} />

            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Load</th>
                    <th>Sets</th>
                    <th>Est. 1RM</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .reverse()
                    .map((w) => {
                      const performed = w.exercises[exerciseId];
                      const best = Math.max(...performed.reps);
                      const estimate = estimatedOneRepMax(performed.weight, best);
                      return (
                        <tr key={w.id}>
                          <td>{new Date(w.date).toLocaleDateString()}</td>
                          <td>
                            {performed.weight || "—"} {performed.unit}
                          </td>
                          <td>{performed.reps.join(" / ")}</td>
                          <td>{estimate ? Math.round(estimate) : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
