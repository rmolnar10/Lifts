"use client";

import { useEffect, useState } from "react";
import { clearLegacyLocalData, readLegacyLocalData } from "@/lib/backup";
import { importBackup } from "@/lib/data";
import type { AppState } from "@/lib/types";

interface Props {
  state: AppState;
  refresh: () => Promise<void>;
}

/**
 * V2–V4 kept everything in localStorage. If this browser still has that data and
 * the cloud account is empty, offer to upload it once so nothing is lost.
 */
export default function LegacyImportBanner({ state, refresh }: Props) {
  const [legacy, setLegacy] = useState<{ key: string; state: AppState } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setLegacy(readLegacyLocalData());
  }, []);

  const cloudIsEmpty = state.workouts.length === 0;
  if (done) return <div className="notice success">Local workout data imported into your account.</div>;
  if (!legacy || !cloudIsEmpty) return null;

  async function onImport() {
    if (!legacy) return;
    setBusy(true);
    setError(null);
    try {
      await importBackup(legacy.state);
      await refresh();
      clearLegacyLocalData();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Import your data from this browser</h3>
      <p className="muted small">
        This browser still has {legacy.state.workouts.length} workout(s) saved locally by an
        earlier version ({legacy.key}). Your cloud account is empty — import them now and
        they will sync to every device.
      </p>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="actions" style={{ marginTop: 0 }}>
        <button className="primary" onClick={onImport} disabled={busy}>
          {busy ? "Importing…" : "Import local data"}
        </button>
        <button onClick={() => setLegacy(null)} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
