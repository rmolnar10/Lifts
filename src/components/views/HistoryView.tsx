"use client";

import { useState } from "react";
import { deleteWorkout } from "@/lib/data";
import type { SharedViewProps } from "@/components/AppShell";

interface Props extends SharedViewProps {
  onEdit: (day: string, workoutId: string) => void;
}

export default function HistoryView({ state, refresh, setError, onEdit }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = state.workouts.slice().reverse();

  async function onDelete(id: string) {
    if (!window.confirm("Delete this workout? This cannot be undone.")) return;
    setBusyId(id);
    setError(null);
    try {
      await deleteWorkout(id);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not delete the workout: ${e.message}`
          : "Could not delete the workout.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <h2>Workout history</h2>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Workout</th>
                <th>Exercises</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td>{new Date(w.date).toLocaleString()}</td>
                  <td>{w.day}</td>
                  <td>{Object.keys(w.exercises).length}</td>
                  <td>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button onClick={() => onEdit(w.day, w.id)}>Edit</button>
                      <button
                        className="danger"
                        onClick={() => onDelete(w.id)}
                        disabled={busyId === w.id}
                      >
                        {busyId === w.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">No workouts yet.</div>
      )}
    </div>
  );
}
