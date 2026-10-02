"use client";

import type { ProgramSummary } from "@/lib/programs";
import type { ActiveProgram } from "@/lib/activeProgram";

interface Props {
  programs: ProgramSummary[];
  program: ActiveProgram;
  week: number;
  onSwitch: (programId: string) => void;
  onWeekChange: (week: number) => void;
}

/**
 * Program and week selector. Hidden entirely when there is one program with no
 * week structure, so the original single-program experience is unchanged.
 */
export default function ProgramPicker({
  programs,
  program,
  week,
  onSwitch,
  onWeekChange,
}: Props) {
  const showPrograms = programs.length > 1;
  const showWeeks = program.hasWeeks;
  if (!showPrograms && !showWeeks) return null;

  const totalWeeks = program.weeks ?? 12;

  return (
    <div className="card">
      <div className="grid">
        {showPrograms ? (
          <div>
            <label htmlFor="program-select">Program</label>
            <select
              id="program-select"
              value={program.id}
              onChange={(e) => onSwitch(e.target.value)}
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {showWeeks ? (
          <div>
            <label htmlFor="week-select">
              Week {program.blockName ? `· ${program.blockName}` : ""}
            </label>
            <select
              id="week-select"
              value={week}
              onChange={(e) => onWeekChange(Number(e.target.value))}
            >
              {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        History, targets, PRs and starting weights are tracked separately for each program.
      </p>
    </div>
  );
}
