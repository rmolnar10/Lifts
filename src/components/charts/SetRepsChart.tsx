"use client";

/**
 * Reps per set across recent sessions, with the top of the rep range drawn in.
 *
 * This is the chart that explains a stall. The progression engine only raises
 * the load once EVERY set clears the dashed line, so a session whose first set
 * towers over its last is work that will never trigger an increase. Seeing the
 * shortest bar in each group sit under the line is the whole point.
 */

import type { Exercise } from "@/lib/program";
import type { SessionPoint } from "@/lib/coaching";

/**
 * Ordinal ramp, blue steps 250-650 from the validated palette: set order is
 * meaningful, so lightness carries it. Light end clears 2:1 on white.
 */
const SET_COLORS = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
const INK = "#17202a";
const MUTED = "#687384";
const AXIS = "#c7d0db";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function SetRepsChart({
  history,
  exercise,
}: {
  history: SessionPoint[];
  exercise: Exercise;
}) {
  const sessions = history.slice(-6);
  if (!sessions.length) return null;

  const width = 680;
  const height = 240;
  const left = 34;
  const right = 12;
  const yTop = 28;
  const yBase = height - 34;

  // 12% headroom keeps the target line clear of the top edge and stops a
  // max-rep bar from merging into it.
  const peak = Math.max(exercise.max, ...sessions.flatMap((s) => s.reps), 1) * 1.12;
  const y = (reps: number) => yBase - (reps / peak) * (yBase - yTop);
  const band = (width - left - right) / sessions.length;
  const maxSets = Math.max(...sessions.map((s) => s.reps.length), 1);
  const barW = Math.min(18, (band - 10) / maxSets);
  const targetY = y(exercise.max);

  return (
    <figure style={{ margin: "10px 0 0" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Reps per set for ${exercise.name} across the last ${sessions.length} sessions, against a top-of-range target of ${exercise.max} reps`}
        style={{ width: "100%", height: "auto", display: "block" }}
        fontSize="11"
      >
        {/* Top of the rep range: clear this on every set and the load goes up. */}
        <line
          x1={left}
          y1={targetY}
          x2={width - right}
          y2={targetY}
          stroke={MUTED}
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <text x={left} y={targetY - 7} fill={MUTED}>
          {exercise.max} reps — every set must reach this to add load
        </text>

        <line x1={left} y1={yBase} x2={width - right} y2={yBase} stroke={AXIS} strokeWidth="2" />

        {sessions.map((session, si) => {
          const weakest = Math.min(...session.reps);
          const groupX = left + si * band + 5;
          const clusterMid = groupX + (session.reps.length * (barW + 2) - 2) / 2;
          return (
            <g key={`${session.date}-${si}`}>
              {session.reps.map((reps, idx) => {
                const barX = groupX + idx * (barW + 2);
                const barY = y(reps);
                const isWeakest = reps === weakest;
                return (
                  <g key={idx}>
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={Math.max(2, yBase - barY)}
                      rx="4"
                      fill={SET_COLORS[Math.min(idx, SET_COLORS.length - 1)]}
                    >
                      <title>{`${shortDate(session.date)} — set ${idx + 1}: ${reps} reps`}</title>
                    </rect>
                    {isWeakest && reps < exercise.max ? (
                      <text
                        x={barX + barW / 2}
                        y={barY - 5}
                        textAnchor="middle"
                        fill={INK}
                        fontSize="10"
                      >
                        {reps}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <text x={clusterMid} y={yBase + 15} textAnchor="middle" fill={MUTED}>
                {shortDate(session.date)}
              </text>
              <text
                x={clusterMid}
                y={yBase + 28}
                textAnchor="middle"
                fill={MUTED}
                fontSize="10"
              >
                {session.weight ? `${session.weight} ${exercise.unit}` : "BW"}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="small muted" style={{ marginTop: 4 }}>
        Bars run set 1 to set {maxSets}, light to dark. The shortest bar in each session is
        labelled — that is the set gating your next load increase.
      </figcaption>
    </figure>
  );
}
