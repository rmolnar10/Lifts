"use client";

import { useRef, useState } from "react";
import { UNTRACKED_TYPES, allExercises, startKey } from "@/lib/program";
import { deleteAllData, importBackup, saveStartingWeights } from "@/lib/data";
import { parseBackup, serialiseBackup } from "@/lib/backup";
import type { SharedViewProps } from "@/components/AppShell";
import type { StartingWeights } from "@/lib/types";

export default function SettingsView({ state, refresh, setError }: SharedViewProps) {
  const tracked = allExercises().filter(({ e }) => !UNTRACKED_TYPES.includes(e.type));

  const [starts, setStarts] = useState<StartingWeights>(() => ({ ...state.starts }));
  const [savingStarts, setSavingStarts] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function fail(e: unknown, fallback: string) {
    setStatus(null);
    setError(e instanceof Error ? `${fallback}: ${e.message}` : fallback);
  }

  async function onSaveStarts() {
    setSavingStarts(true);
    setError(null);
    setStatus(null);
    try {
      await saveStartingWeights(starts);
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
      `Import ${parsed.workouts.length} workout(s)? This replaces all of your cloud data ` +
        "for this account and cannot be undone.",
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      const count = await importBackup(parsed);
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
    if (!window.confirm("Delete all workout data and starting weights?")) return;
    setResetting(true);
    setError(null);
    setStatus(null);
    try {
      await deleteAllData();
      await refresh();
      setStarts({});
      setStatus("All data deleted.");
    } catch (e) {
      fail(e, "Could not reset your data");
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      {status ? <div className="notice success">{status}</div> : null}

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
