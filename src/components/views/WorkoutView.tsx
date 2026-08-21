"use client";

import { useState } from "react";
import { DAYS, PROGRAM, UNWEIGHTED_TYPES, type Exercise } from "@/lib/program";
import { previousPerformance, suggest } from "@/lib/progression";
import { saveWorkout, type ExercisePayload } from "@/lib/data";
import type { SharedViewProps } from "@/components/AppShell";
import type { LoggedExercise } from "@/lib/types";

interface Props extends SharedViewProps {
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onDone: () => void;
}

/** One exercise's inputs. Values are kept as strings so blank stays blank. */
interface ExerciseForm {
  weight: string;
  rir: string;
  reps: string[];
}

const takesWeight = (exercise: Exercise) => !UNWEIGHTED_TYPES.includes(exercise.type);

function initialForm(
  exercise: Exercise,
  previous: LoggedExercise | null,
  suggestedWeight: number | "",
): ExerciseForm {
  const weight = takesWeight(exercise)
    ? String(previous?.weight ?? suggestedWeight ?? "")
    : "";
  return {
    weight,
    rir: previous?.rir === null || previous?.rir === undefined ? "" : String(previous.rir),
    reps: Array.from({ length: exercise.sets }, (_, i) =>
      previous?.reps?.[i] === undefined ? "" : String(previous.reps[i]),
    ),
  };
}

export default function WorkoutView({
  state,
  day,
  setDay,
  refresh,
  startRest,
  setError,
  editingId,
  setEditingId,
  onDone,
}: Props) {
  const { workouts, starts } = state;
  const editing = editingId ? (workouts.find((w) => w.id === editingId) ?? null) : null;

  const [forms, setForms] = useState<Record<string, ExerciseForm>>(() => {
    const initial: Record<string, ExerciseForm> = {};
    for (const exercise of PROGRAM[day]) {
      // When logging a new workout the inputs are pre-filled with last time's
      // performance, exactly as in V4; when editing, with the saved values.
      const previous = editing
        ? (editing.exercises[exercise.id] ?? null)
        : previousPerformance(workouts, day, exercise.id);
      const suggestion = suggest(exercise, day, workouts, starts);
      initial[exercise.id] = initialForm(exercise, previous, suggestion.weight);
    }
    return initial;
  });

  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  function update(exerciseId: string, patch: Partial<ExerciseForm>) {
    setForms((current) => ({ ...current, [exerciseId]: { ...current[exerciseId], ...patch } }));
  }

  function updateRep(exerciseId: string, index: number, value: string) {
    setForms((current) => {
      const reps = current[exerciseId].reps.slice();
      reps[index] = value;
      return { ...current, [exerciseId]: { ...current[exerciseId], reps } };
    });
  }

  async function onSave() {
    if (saving) return; // Guard against a double tap creating two workouts.
    setSaving(true);
    setError(null);

    const exercises: ExercisePayload[] = PROGRAM[day].map((exercise) => {
      const form = forms[exercise.id];
      return {
        exercise_id: exercise.id,
        name: exercise.name,
        weight: takesWeight(exercise) ? Number(form.weight || 0) : 0,
        unit: exercise.unit,
        rir: form.rir === "" ? null : Number(form.rir),
        reps: Array.from({ length: exercise.sets }, (_, i) => Number(form.reps[i] || 0)),
      };
    });

    try {
      await saveWorkout({
        workoutId: editingId,
        day,
        performedAt: null, // New workouts default to now; edits keep their date.
        notes,
        exercises,
      });
      await refresh();
      onDone();
    } catch (e) {
      setError(
        e instanceof Error ? `Could not save the workout: ${e.message}` : "Could not save the workout.",
      );
      setSaving(false);
    }
  }

  return (
    <>
      <div className="tabs">
        {DAYS.map((d) => (
          <button
            key={d}
            className={d === day ? "active" : ""}
            onClick={() => {
              setEditingId(null);
              setDay(d);
            }}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="row">
          <div>
            <h2>
              {editing ? "Edit " : ""}
              {day}
            </h2>
            <div className="muted small">
              {editing
                ? "Modify the saved workout and save changes."
                : "Log actual performance. RIR is optional but useful for calibrating progression."}
            </div>
          </div>
          {!editing ? <button onClick={() => startRest(90)}>Rest timer</button> : null}
        </div>
      </div>

      {PROGRAM[day].map((exercise, index) => {
        const suggestion = suggest(exercise, day, workouts, starts);
        const form = forms[exercise.id];
        return (
          <div className="card" key={exercise.id}>
            <div className="exercise-head">
              <div>
                <h3>
                  {index + 1}. {exercise.name}
                </h3>
                <span className="badge">
                  {exercise.sets} ×{" "}
                  {exercise.min ? `${exercise.min}–${exercise.max}` : "near failure"}{" "}
                  {exercise.unit}
                </span>
              </div>
              <button onClick={() => startRest(exercise.rest)}>Rest</button>
            </div>

            {!editing ? (
              <div className="target">
                <b>Next target:</b> {suggestion.target}
                <br />
                <span className="small">{suggestion.focus}</span>
              </div>
            ) : null}

            <div className="grid" style={{ marginTop: 10 }}>
              {takesWeight(exercise) ? (
                <div>
                  <label htmlFor={`w-${exercise.id}`}>Weight ({exercise.unit})</label>
                  <input
                    id={`w-${exercise.id}`}
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    value={form.weight}
                    onChange={(e) => update(exercise.id, { weight: e.target.value })}
                  />
                </div>
              ) : null}
              <div>
                <label htmlFor={`rir-${exercise.id}`}>RIR after final set</label>
                <input
                  id={`rir-${exercise.id}`}
                  type="number"
                  min="0"
                  max="5"
                  step="1"
                  inputMode="numeric"
                  placeholder="0–5"
                  value={form.rir}
                  onChange={(e) => update(exercise.id, { rir: e.target.value })}
                />
              </div>
            </div>

            <div className="sets">
              {form.reps.map((value, setIndex) => (
                <div key={setIndex}>
                  <label htmlFor={`r-${exercise.id}-${setIndex}`}>
                    Set {setIndex + 1} reps{exercise.type === "timed" ? " / sec" : ""}
                  </label>
                  <input
                    id={`r-${exercise.id}-${setIndex}`}
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={value}
                    onChange={(e) => updateRep(exercise.id, setIndex, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="card">
        <label htmlFor="workout-notes">Workout notes</label>
        <textarea
          id="workout-notes"
          placeholder="Sleep, energy, technique notes, anything worth remembering..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="actions">
        <button className="primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Finish & save workout"}
        </button>
        <button onClick={onDone} disabled={saving}>
          Cancel
        </button>
      </div>
    </>
  );
}
