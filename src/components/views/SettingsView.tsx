"use client";

import { useRef, useState } from "react";
import { UNTRACKED_TYPES, startKey } from "@/lib/program";
import { allExercisesIn } from "@/lib/activeProgram";
import { importProgram, type ProgramSummary } from "@/lib/programs";
import type { ProgramSpec } from "@/lib/programSpec";
import { deleteAllData, importBackup, saveStartingWeights } from "@/lib/data";
import { parseBackup, serialiseBackup } from "@/lib/backup";
import type { SharedViewProps } from "@/components/AppShell";
import type { StartingWeights } from "@/lib/types";

export default function SettingsView({
  state,
  refresh,
  setError,
  program,
  programs,
  onProgramsChanged,
}: SharedViewProps) {
  const tracked = allExercisesIn(program).filter(({ e }) => !UNTRACKED_TYPES.includes(e.type));

  const [starts, setStarts] = useState<StartingWeights>(() => ({ ...state.starts }));
  const [savingStarts, setSavingStarts] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const programInput = useRef<HTMLInputElement>(null);
  const [importingProgram, setImportingProgram] = useState(false);

  function fail(e: unknown, fallback: string) {
    setStatus(null);
    setError(e instanceof Error ? `${fallback}: ${e.message}` : fallback);
  }

  async function onSaveStarts() {
    setSavingStarts(true);
    setError(null);
    setStatus(null);
    try {
      await saveStartingWeights(starts, program.id);
      await refresh();
      setStatus("Starting weights saved.");
    } catch (e) {
      fail(e, "Could not save starting weights");
    } finally {
      setSavingStarts(false);
    }
  }

  function onExport() {
    const blob = new Blob([serialiseBackup(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lift-tracker-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // Allow re-importing the same file.
    if (!file) return;

    setError(null);
    setStatus(null);

    let parsed;
    try {
      parsed = parseBackup(await file.text());
    } catch (e) {
      fail(e, "Could not read that backup");
      return;
    }

    const confirmed = window.confirm(
      `Import ${parsed.workouts.length} workout(s) into ${program.name}? This replaces that ` +
        "program's cloud data and cannot be undone.",
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      const count = await importBackup(parsed, program.id);
      await refresh();
      setStarts({ ...parsed.starts });
      setStatus(`Backup imported — ${count} workout(s) restored.`);
    } catch (e) {
      fail(e, "Could not import that backup");
    } finally {
      setImporting(false);
    }
  }

  async function onReset() {
    if (!window.confirm(`Delete all ${program.name} workouts and starting weights? Other programs are not affected.`)) return;
    setResetting(true);
    setError(null);
    setStatus(null);
    try {
      await deleteAllData(program.id);
      await refresh();
      setStarts({});
      setStatus("All data deleted.");
    } catch (e) {
      fail(e, "Could not reset your data");
    } finally {
      setResetting(false);
    }
  }

  async function onImportProgram(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setStatus(null);

    let spec: ProgramSpec;
    try {
      spec = JSON.parse(await file.text()) as ProgramSpec;
      if (!spec.slug || !Array.isArray(spec.blocks)) {
        throw new Error("that file is not a program (it needs a slug and blocks)");
      }
    } catch (e) {
      fail(e, "Could not read that program");
      return;
    }

    setImportingProgram(true);
    try {
      await importProgram(spec);
      await onProgramsChanged();
      setStatus(`"${spec.name ?? spec.slug}" imported. Switch to it at the top of the page.`);
    } catch (e) {
      fail(e, "Could not import that program");
    } finally {
      setImportingProgram(false);
    }
  }

  return (
    <>
      {status ? <div className="notice success">{status}</div> : null}

      <div className="card">
        <h2>Programs</h2>
        <p className="muted small">
          Each program keeps its own history, targets, PRs and starting weights. Nothing is
          shared between them.
        </p>
        {programs.map((p: ProgramSummary) => (
          <div className="pr" key={p.id}>
            <span>
              <b>{p.name}</b>
              <br />
              <span className="muted small">
                {p.weeks ? `${p.weeks} weeks` : "Ongoing"}
                {p.id === program.id ? " · currently active" : ""}
              </span>
            </span>
          </div>
        ))}
        <div className="actions">
          <button onClick={() => programInput.current?.click()} disabled={importingProgram}>
            {importingProgram ? "Importing…" : "Import a program"}
          </button>
          <input
            ref={programInput}
            id="program-import"
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={onImportProgram}
          />
        </div>
        <p className="muted small">
          Importing a program with a slug you already have replaces its structure and keeps
          the workouts logged against it.
        </p>
      </div>

      <div className="card">
        <h2>Starting weights</h2>
        <p className="muted small">
          These are your initial loads. Changing them does not rewrite workout history.
        </p>
        <div className="grid">
          {tracked.map(({ day, e }) => {
            const key = startKey(day, e.id);
            return (
              <div key={key}>
                <label htmlFor={`start-${key}`}>
                  {day} — {e.name} ({e.unit})
                </label>
                <input
                  id={`start-${key}`}
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  value={starts[key] ?? ""}
                  onChange={(event) =>
                    setStarts((current) => ({
                      ...current,
                      [key]: event.target.value === "" ? "" : Number(event.target.value),
                    }))
                  }
                />
              </div>
            );
          })}
        </div>
        <div className="actions">
          <button className="primary" onClick={onSaveStarts} disabled={savingStarts}>
            {savingStarts ? "Saving…" : "Save starting weights"}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Data</h2>
        <div className="actions" style={{ marginTop: 0 }}>
          <button onClick={onExport}>Export backup</button>
          <button onClick={() => fileInput.current?.click()} disabled={importing}>
            {importing ? "Importing…" : "Import backup"}
          </button>
          <input
            ref={fileInput}
            id="backup-import"
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={onImport}
          />
        </div>
        <p className="muted small">
          Your data lives in Supabase and syncs across devices. Export a JSON backup
          before large changes — importing one replaces everything in this account.
        </p>
      </div>

      <div className="card">
        <h2>Reset</h2>
        <p className="muted small">
          Deletes every workout and starting weight in your account. Export a backup first.
        </p>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="danger" onClick={onReset} disabled={resetting}>
            {resetting ? "Deleting…" : "Reset data"}
          </button>
        </div>
      </div>
    </>
  );
}
