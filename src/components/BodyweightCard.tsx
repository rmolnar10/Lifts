"use client";

import { useState } from "react";
import { logBodyweight } from "@/lib/data";
import { bodyweightNote } from "@/lib/engine";
import type { BodyweightEntry } from "@/lib/types";

/** Today as YYYY-MM-DD in the lifter's own timezone, not UTC. */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysSince(date: string): number {
  return Math.floor((Date.parse(localToday()) - Date.parse(date)) / 86_400_000);
}

/**
 * Weekly bodyweight. One number, once a week, is enough for the engine to tell
 * "stalled because the cut is too aggressive" from "stalled because the load is
 * ahead of you".
 */
export default function BodyweightCard({
  entries,
  available,
  refresh,
  setError,
}: {
  entries: BodyweightEntry[];
  /** False until migration 0006 is applied. */
  available: boolean;
  refresh: () => Promise<void>;
  setError: (error: string | null) => void;
}) {
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const last = entries.length ? entries[entries.length - 1] : null;
  const due = !last || daysSince(last.date) >= 7;
  const note = bodyweightNote(entries);

  async function onSave() {
    const value = Number(weight);
    if (!weight || !Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      await logBodyweight(localToday(), value);
      setWeight("");
      setError(null);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? `Could not save bodyweight: ${e.message}` : "Could not save bodyweight.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={due && available ? "card warn" : "card"}>
      <h3>Bodyweight</h3>
      {!available ? (
        <p className="muted small">
          Bodyweight tracking switches on once the V6 database update
          (<code>0006_v6_inputs.sql</code>) is applied.
        </p>
      ) : (
        <>
          <p className="small" style={{ margin: "4px 0 8px" }}>
            {last
              ? `Last: ${last.weight} lb on ${new Date(`${last.date}T12:00:00`).toLocaleDateString()}.`
              : "No bodyweight logged yet."}{" "}
            {due ? "Time for this week's weigh-in." : "Next weigh-in is due in a few days."}
          </p>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <input
              aria-label="Bodyweight (lb)"
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder="lb"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              style={{ maxWidth: 120 }}
            />
            <button className="primary" onClick={onSave} disabled={saving || !weight}>
              {saving ? "Saving…" : "Log weight"}
            </button>
          </div>
          {note ? <p className="small muted" style={{ marginBottom: 0 }}>{note}</p> : null}
        </>
      )}
    </div>
  );
}
