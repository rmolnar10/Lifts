"use client";

import { calcPRs } from "@/lib/stats";
import type { AppState } from "@/lib/types";

export default function PRsView({ state }: { state: AppState }) {
  const records = calcPRs(state.workouts);

  return (
    <div className="card">
      <h2>Personal records</h2>
      {records.length ? (
        records.map((record, index) => (
          <div className="pr" key={`${record.day}-${record.name}-${record.type}-${index}`}>
            <span>
              <b>{record.name}</b>
              <br />
              <span className="muted small">
                {record.day} · {record.type}
              </span>
            </span>
            <b>{record.value}</b>
          </div>
        ))
      ) : (
        <div className="muted">Complete workouts to create PRs.</div>
      )}
    </div>
  );
}
