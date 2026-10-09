"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UNWEIGHTED_TYPES, type Exercise } from "@/lib/program";
import { exercisesForDay, targetRirLabel } from "@/lib/activeProgram";
import { previousPerformance, suggest } from "@/lib/progression";
import { saveWorkout, type ExercisePayload } from "@/lib/data";
import { retiredExercisePayloads } from "@/lib/retired";
import { deloadStatus } from "@/lib/deload";
import type { SharedViewProps } from "@/components/AppShell";
import type { LoggedExercise } from "@/lib/types";
import {
  clearDraft,
  describeAge,
  readDraft,
  writeDraft,
  type WorkoutDraft,
} from "@/lib/draft";

interface Props extends SharedViewProps {
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onDone: () => void;
  /** Scopes drafts to the signed-in account. */
  account: string;
}

/** One exercise's inputs. Values are kept as strings so blank stays blank. */
interface ExerciseForm {
  weight: string;
  rir: string;
  reps: string[];
}

const takesWeight = (exercise: Exercise) => !UNWEIGHTED_TYPES.includes(exercise.type);

/** A blank form, used if an exercise somehow has no entry yet. */
function emptyForm(exercise: Exercise): ExerciseForm {
  return { weight: "", rir: "", reps: Array.from({ length: exercise.sets }, () => "") };
}

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
  account,
  program,
}: Props) {
  const { workouts, starts } = state;
  const editing = editingId ? (workouts.find((w) => w.id === editingId) ?? null) : null;

  // A draft from a previous visit to this screen wins over the computed
  // defaults — that is the whole point of it.
  const [restored] = useState<WorkoutDraft | null>(() => readDraft(account, program, day, editingId));

  /**
   * The inputs as they look with no draft: last session's performance when
   * logging a new workout (exactly as in V4), or the saved values when editing.
   */
  const computeDefaults = useCallback((): Record<string, ExerciseForm> => {
    const defaults: Record<string, ExerciseForm> = {};
    for (const exercise of exercisesForDay(program, day)) {
      const previous = editing
        ? (editing.exercises[exercise.id] ?? null)
        : previousPerformance(workouts, day, exercise.id);
      const suggestion = suggest(exercise, day, workouts, starts);
      defaults[exercise.id] = initialForm(exercise, previous, suggestion.weight);
    }
    return defaults;
  }, [day, editing, workouts, starts, program]);

  const [forms, setForms] = useState<Record<string, ExerciseForm>>(() => {
    const defaults = computeDefaults();
    if (!restored) return defaults;
    return Object.fromEntries(
      Object.entries(defaults).map(([id, value]) => [id, restored.forms[id] ?? value]),
    );
  });

  const [notes, setNotes] = useState(restored?.notes ?? editing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(restored !== null);

  // Only mirror to storage once the user has actually typed something, so
  // merely opening the tab never creates a draft.
  const dirty = useRef(false);
  const markDirty = useCallback(() => {
    dirty.current = true;
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    writeDraft(account, program.id, editingId, {
      savedAt: new Date().toISOString(),
      day,
      forms,
      notes,
    });
  }, [account, program.id, day, editingId, forms, notes]);

  /** Drops the stored draft. `reset` also puts the visible inputs back to their
   *  defaults, which is what "Start fresh" means to someone looking at them. */
  const discardDraft = useCallback(
    (reset = false) => {
      dirty.current = false;
      clearDraft(account, program.id, day, editingId);
      setDraftRestored(false);
      if (reset) {
        setForms(computeDefaults());
        setNotes(editing?.notes ?? "");
      }
    },
    [account, program.id, day, editingId, computeDefaults, editing],
  );

  function update(exerciseId: string, patch: Partial<ExerciseForm>) {
    markDirty();
    setForms((current) => ({
      ...current,
      [exerciseId]: { ...(current[exerciseId] ?? { weight: "", rir: "", reps: [] }), ...patch },
    }));
  }

  function updateRep(exerciseId: string, index: number, value: string) {
    markDirty();
    setForms((current) => {
      const existing = current[exerciseId] ?? { weight: "", rir: "", reps: [] };
      const reps = existing.reps.slice();
      reps[index] = value;
      return { ...current, [exerciseId]: { ...existing, reps } };
    });
  }

  async function onSave() {
    if (saving) return; // Guard against a double tap creating two workouts.
    setSaving(true);
    setError(null);

    const exercises: ExercisePayload[] = exercisesForDay(program, day).map((exercise) => {
      const form = forms[exercise.id] ?? emptyForm(exercise);
      return {
        exercise_id: exercise.id,
        name: exercise.name,
        weight: takesWeight(exercise) ? Number(form.weight || 0) : 0,
        unit: exercise.unit,
        rir: form.rir === "" ? null : Number(form.rir),
        reps: Array.from({ length: exercise.sets }, (_, i) => Number(form.reps[i] || 0)),
      };
    });

    // Carry through anything logged under an earlier version of the program.
    exercises.push(...retiredExercisePayloads(day, editing, program));

    try {
      await saveWorkout({
        workoutId: editingId,
        day,
        performedAt: null, // New workouts default to now; edits keep their date.
        notes,
        exercises,
        programId: program.id,
        weekNumber: program.hasWeeks ? program.week : null,
      });
      discardDraft();
      await refresh();
      onDone();
    } catch (e) {
      setError(
        e instanceof Error ? `Could not save the workout: ${e.message}` : "Could not save the workout.",
      );
      setSaving(false);
    }
  }

  function onCancel() {
    // Cancel throws away an in-progress workout, so make sure it was meant.
    if (dirty.current || draftRestored) {
      if (!window.confirm("Discard this in-progress workout? Your entries will be lost.")) return;
    }
    discardDraft();
    onDone();
  }

  // A workout logged under a day the program no longer has — the old
  // Legs + Abs day, say. Its history is intact and still shows in History and
  // in the export; there is simply no template left to edit it against, and an
  // empty form would invite the user to save over it with nothing.
  if (!exercisesForDay(program, day).length) {
    return (
      <div className="card">
        <h2>{day}</h2>
        <p className="small">
          This day is no longer part of <strong>{program.name}</strong>, so there is no
          template to log against. Your {day} history is untouched — you can still see it
          under History and in any export.
        </p>
        <button
          onClick={() => {
            setEditingId(null);
            setDay(program.dayOrder[0] ?? day);
          }}
        >
          Back to {program.dayOrder[0] ?? "the program"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="tabs">
        {program.dayOrder.map((d) => (
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

      {draftRestored && restored ? (
        <div className="notice">
          Picked up where you left off — entries saved {describeAge(restored.savedAt)} on this
          device.{" "}
          <button className="link-button" onClick={() => discardDraft(true)}>
            Start fresh
          </button>
        </div>
      ) : null}

      {!editing && deloadStatus(state.workouts, program).due ? (
        <div className="notice warn">
          <strong>Deload session.</strong> {deloadStatus(state.workouts, program).message}
        </div>
      ) : null}

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

      {exercisesForDay(program, day).map((exercise, index) => {
        const suggestion = suggest(exercise, day, workouts, starts);
        const form = forms[exercise.id] ?? emptyForm(exercise);
        return (
          <div className="card" key={exercise.id}>
            <div className="exercise-head">
              <div>
                <h3>
                  {exercise.supersetGroup ? `${exercise.supersetGroup}: ` : `${index + 1}. `}
                  {exercise.name}
                </h3>
                <div className="badges">
                  <span className="badge">
                    {exercise.sets} ×{" "}
                    {exercise.min ? `${exercise.min}–${exercise.max}` : "near failure"}{" "}
                    {exercise.type === "timed" ? "sec" : "reps"}
                    {exercise.perSide ? " per side" : ""}
                  </span>
                  {targetRirLabel(exercise) ? (
                    <span className="badge">{targetRirLabel(exercise)}</span>
                  ) : null}
                  {exercise.dropset ? <span className="badge warn-badge">Dropset</span> : null}
                  {exercise.supersetGroup ? (
                    <span className="badge">Superset</span>
                  ) : null}
                </div>
              </div>
              <button onClick={() => startRest(exercise.rest)}>
                {exercise.rest ? "Rest" : "No rest"}
              </button>
            </div>

            {exercise.dropset ? (
              <p className="muted small" style={{ marginTop: 8 }}>
                Hit the rep target, cut the load by about half, then keep going to failure.
                Log the reps from the first part of the set.
              </p>
            ) : null}

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
                <label htmlFor={`rir-${exercise.id}`}>
                  RIR after final set
                  {targetRirLabel(exercise) ? ` — aim for ${targetRirLabel(exercise)}` : ""}
                </label>
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
        <button onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </>
  );
}
