"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UNWEIGHTED_TYPES, type Exercise } from "@/lib/program";
import { exercisesForDay, targetRirLabel } from "@/lib/activeProgram";
import { previousPerformance } from "@/lib/progression";
import { planNext } from "@/lib/engine";
import { saveWorkout, type ExercisePayload } from "@/lib/data";
import { retiredExercisePayloads } from "@/lib/retired";
import { deloadStatus } from "@/lib/deload";
import type { SharedViewProps } from "@/components/AppShell";
import { READINESS_LEVELS, type LoggedExercise, type Readiness } from "@/lib/types";
import {
  clearDraft,
  describeAge,
  MAX_EXTRA_SETS,
  readDraft,
  writeDraft,
  type FormCheck,
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
  form?: FormCheck;
}

const takesWeight = (exercise: Exercise) => !UNWEIGHTED_TYPES.includes(exercise.type);

/** Form is worth checking wherever there is a rep to do badly. */
const checksForm = (exercise: Exercise) =>
  !["timed", "practice", "optional"].includes(exercise.type);

const READINESS_LABEL: Record<Readiness, string> = {
  rough: "Rough",
  normal: "Normal",
  good: "Good",
};

/** A blank form, used if an exercise somehow has no entry yet. */
function emptyForm(exercise: Exercise): ExerciseForm {
  return { weight: "", rir: "", reps: Array.from({ length: exercise.sets }, () => ""), form: "" };
}

/** `reps` resized to `sets`, keeping what is there and leaving new sets blank. */
function resize(reps: string[], sets: number): string[] {
  return Array.from({ length: sets }, (_, i) => reps[i] ?? "");
}

function initialForm(
  exercise: Exercise,
  previous: LoggedExercise | null,
  plannedWeight: number | "",
  sets: number,
  editing: boolean,
): ExerciseForm {
  // A new workout starts from the engine's load, so a planned increase or a
  // back-off is already in the box; an edit shows exactly what was saved.
  const weight = !takesWeight(exercise)
    ? ""
    : editing
      ? String(previous?.weight ?? "")
      : String(plannedWeight !== "" ? plannedWeight : (previous?.weight ?? ""));
  const formOk = editing ? previous?.formOk : null;
  return {
    weight,
    rir: previous?.rir === null || previous?.rir === undefined ? "" : String(previous.rir),
    reps: Array.from({ length: sets }, (_, i) =>
      previous?.reps?.[i] === undefined ? "" : String(previous.reps[i]),
    ),
    form: formOk === true ? "held" : formOk === false ? "broke" : "",
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

  const [readiness, setReadiness] = useState<Readiness | null>(() => {
    const saved = restored?.readiness ?? editing?.readiness ?? null;
    return READINESS_LEVELS.includes(saved as Readiness) ? (saved as Readiness) : null;
  });

  const planFor = useCallback(
    (exercise: Exercise, today: Readiness | null) =>
      planNext(exercise, day, workouts, starts, {
        readinessToday: today,
        bodyweight: state.bodyweight,
      }),
    [day, workouts, starts, state.bodyweight],
  );

  /**
   * The inputs as they look with no draft: last session's performance with the
   * engine's load and set count when logging a new workout, or the saved values
   * when editing.
   */
  const computeDefaults = useCallback(
    (today: Readiness | null = null): Record<string, ExerciseForm> => {
      const defaults: Record<string, ExerciseForm> = {};
      for (const exercise of exercisesForDay(program, day)) {
        const previous = editing
          ? (editing.exercises[exercise.id] ?? null)
          : previousPerformance(workouts, day, exercise.id);
        const plan = planFor(exercise, today);
        const sets = editing
          ? Math.max(1, previous?.reps.length || exercise.sets)
          : plan.sets;
        defaults[exercise.id] = initialForm(exercise, previous, plan.weight, sets, editing !== null);
      }
      return defaults;
    },
    [day, editing, workouts, program, planFor],
  );

  const [forms, setForms] = useState<Record<string, ExerciseForm>>(() => {
    const defaults = computeDefaults(readiness);
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
      readiness: readiness ?? "",
    });
  }, [account, program.id, day, editingId, forms, notes, readiness]);

  /** Drops the stored draft. `reset` also puts the visible inputs back to their
   *  defaults, which is what "Start fresh" means to someone looking at them. */
  const discardDraft = useCallback(
    (reset = false) => {
      dirty.current = false;
      clearDraft(account, program.id, day, editingId);
      setDraftRestored(false);
      if (reset) {
        const saved = editing?.readiness ?? null;
        setReadiness(saved);
        setForms(computeDefaults(saved));
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

  /**
   * Readiness changes the plan, and a rough day drops any added sets. The
   * weight and set count follow the new plan; reps already typed are kept.
   */
  function chooseReadiness(next: Readiness | null) {
    markDirty();
    setReadiness(next);
    if (editing) return;
    setForms((current) => {
      const updated = { ...current };
      for (const exercise of exercisesForDay(program, day)) {
        const existing = current[exercise.id] ?? emptyForm(exercise);
        const before = planFor(exercise, readiness);
        const plan = planFor(exercise, next);
        // Follow the plan only where the box still holds the old plan's load;
        // a weight the lifter typed themselves stays.
        const untouched = existing.weight === String(before.weight);
        updated[exercise.id] = {
          ...existing,
          weight:
            takesWeight(exercise) && plan.weight !== "" && untouched
              ? String(plan.weight)
              : existing.weight,
          reps: resize(existing.reps, plan.sets),
        };
      }
      return updated;
    });
  }

  function changeSetCount(exercise: Exercise, delta: number) {
    const existing = forms[exercise.id] ?? emptyForm(exercise);
    const next = existing.reps.length + delta;
    if (next < 1 || next > exercise.sets + MAX_EXTRA_SETS) return;
    update(exercise.id, { reps: resize(existing.reps, next) });
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
        form_ok: form.form === "held" ? true : form.form === "broke" ? false : null,
        reps: form.reps.map((r) => Number(r || 0)),
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
        readiness,
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

        <div style={{ marginTop: 10 }}>
          <div className="label" id="readiness-label">
            How do you feel walking in?
          </div>
          <div className="seg" role="group" aria-labelledby="readiness-label">
            {READINESS_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={readiness === level}
                className={readiness === level ? "active" : ""}
                onClick={() => chooseReadiness(readiness === level ? null : level)}
              >
                {READINESS_LABEL[level]}
              </button>
            ))}
          </div>
          {readiness === "rough" && !editing ? (
            <div className="small muted" style={{ marginTop: 6 }}>
              Rough day: targets hold at last session&apos;s numbers, and this session will not
              count against any lift.
            </div>
          ) : null}
        </div>
      </div>

      {state.v6Inputs === false ? (
        <div className="notice">
          Readiness and form will not be saved until the V6 database update
          (<code>0006_v6_inputs.sql</code>) is applied. The workout itself saves as normal.
        </div>
      ) : null}

      {exercisesForDay(program, day).map((exercise, index) => {
        const suggestion = planFor(exercise, readiness);
        const form = forms[exercise.id] ?? emptyForm(exercise);
        const extra = form.reps.length - exercise.sets;
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
                    {form.reps.length} ×{" "}
                    {exercise.min ? `${exercise.min}–${exercise.max}` : "near failure"}{" "}
                    {exercise.type === "timed" ? "sec" : "reps"}
                    {exercise.perSide ? " per side" : ""}
                  </span>
                  {targetRirLabel(exercise) ? (
                    <span className="badge">{targetRirLabel(exercise)}</span>
                  ) : null}
                  {extra > 0 ? (
                    <span className="badge">+{extra} set{extra === 1 ? "" : "s"}</span>
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
                {suggestion.note ? (
                  <>
                    <br />
                    <span className="small muted">{suggestion.note}</span>
                  </>
                ) : null}
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

            <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
              <div className="seg" role="group" aria-label={`Sets for ${exercise.name}`}>
                <button
                  type="button"
                  onClick={() => changeSetCount(exercise, -1)}
                  disabled={form.reps.length <= 1}
                  aria-label={`Remove a set from ${exercise.name}`}
                >
                  − Set
                </button>
                <button
                  type="button"
                  onClick={() => changeSetCount(exercise, 1)}
                  disabled={form.reps.length >= exercise.sets + MAX_EXTRA_SETS}
                  aria-label={`Add a set to ${exercise.name}`}
                >
                  + Set
                </button>
              </div>
              {checksForm(exercise) ? (
                <div className="seg" role="group" aria-label={`Form on ${exercise.name}`}>
                  <button
                    type="button"
                    aria-pressed={form.form === "held"}
                    className={form.form === "held" ? "active" : ""}
                    onClick={() =>
                      update(exercise.id, { form: form.form === "held" ? "" : "held" })
                    }
                  >
                    Form held
                  </button>
                  <button
                    type="button"
                    aria-pressed={form.form === "broke"}
                    className={form.form === "broke" ? "active bad" : ""}
                    onClick={() =>
                      update(exercise.id, { form: form.form === "broke" ? "" : "broke" })
                    }
                  >
                    Form broke
                  </button>
                </div>
              ) : null}
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
