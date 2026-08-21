"use client";

import { useState } from "react";
import { UNTRACKED_TYPES, allExercises, findExercise } from "@/lib/program";
import { estimatedOneRepMax } from "@/lib/stats";
import type { AppState } from "@/lib/types";

export default function ProgressView({ state }: { state: AppState }) {
  const options = allExercises().filter(({ e }) => !UNTRACKED_TYPES.includes(e.type));
  const [selected, setSelected] = useState(() =>
    options.length ? `${options[0].day}|${options[0].e.id}` : "",
  );

  const [day, exerciseId] = selected.split("|");
  const exercise = day && exerciseId ? findExercise(day, exerciseId) : undefined;
  const rows = state.workouts.filter((w) => w.day === day && w.exercises[exerciseId]).slice(-12);
  const values = rows.map((w) => w.exercises[exerciseId].weight || 0);
  const max = Math.max(...values, 1);

  return (
    <div className="card">
      <h2>Progress</h2>
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

      <div style={{ marginTop: 12 }}>
        {!rows.length || !exercise ? (
          <div className="muted">No history yet.</div>
        ) : (
          <>
            <div className="card">
              <h3>{exercise.name} — load trend</h3>
              <div className="chart">
                {values.map((value, index) => (
                  <div className="chart-col" key={index}>
                    <div
                      className="chart-bar"
                      style={{ height: Math.max(5, Math.round((value / max) * 120)) }}
                    />
                    <div className="small" style={{ textAlign: "center" }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="table-scroll">
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
    </div>
  );
}
