"use client";

import { calcPRs } from "@/lib/stats";
import type { AppState } from "@/lib/types";
import type { ActiveProgram } from "@/lib/activeProgram";

export default function PRsView({
  state,
  program,
}: {
  state: AppState;
  program: ActiveProgram;
}) {
  const records = calcPRs(state.workouts, program);

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
