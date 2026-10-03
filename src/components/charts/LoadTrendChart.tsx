"use client";

/**
 * Working load over time for one exercise. A single series, so no legend —
 * the heading names it. Flat stretches are the thing worth seeing, so every
 * session is a visible point and the first and last carry their value.
 */

import type { Exercise } from "@/lib/program";
import type { SessionPoint } from "@/lib/coaching";

const ACCENT = "#2a78d6";
const INK = "#17202a";
const MUTED = "#687384";
const AXIS = "#c7d0db";

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function LoadTrendChart({
  history,
  exercise,
}: {
  history: SessionPoint[];
  exercise: Exercise;
}) {
  const sessions = history.slice(-12);
  if (sessions.length < 2) return null;

  // A load that has never moved is already stated by the headline and printed
  // under every group of the set chart. A flat line adds nothing but height.
  const distinctLoads = new Set(sessions.map((s) => s.weight));
  if (distinctLoads.size < 2) return null;

  const width = 680;
  const height = 190;
  const left = 44;
  const right = 16;
  const yTop = 20;
  const yBase = height - 32;

  const loads = sessions.map((s) => s.weight);
  const lo = Math.min(...loads);
  const hi = Math.max(...loads);
  // A line shows change, so the scale frames the range rather than starting at
  // zero: on a lift already at 100 lb, a zero baseline squashes a real 15 lb
  // climb into a flat line. Both ends are labelled and the caption says the
  // axis is not zero-based, so the gain cannot be read as bigger than it is.
  const pad = (hi - lo) * 0.35;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const y = (value: number) => yBase - ((value - yMin) / (yMax - yMin)) * (yBase - yTop);
  const x = (index: number) =>
    left + (index * (width - left - right)) / Math.max(1, sessions.length - 1);

  const points = sessions.map((s, i) => `${x(i)},${y(s.weight)}`).join(" ");
  const first = sessions[0];
  const last = sessions[sessions.length - 1];

  return (
    <figure style={{ margin: "10px 0 0" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Working load for ${exercise.name} over the last ${sessions.length} sessions, from ${first.weight} to ${last.weight} ${exercise.unit}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        fontSize="11"
      >
        {/* Gridlines at the actual low and high, so both carry a real number. */}
        {[lo, hi].map((value) => (
          <g key={value}>
            <line
              x1={left}
              y1={y(value)}
              x2={width - right}
              y2={y(value)}
              stroke={AXIS}
              strokeWidth="1"
            />
            <text x={left - 8} y={y(value) + 4} textAnchor="end" fill={MUTED}>
              {value}
            </text>
          </g>
        ))}
        <line x1={left} y1={yBase} x2={width - right} y2={yBase} stroke={AXIS} strokeWidth="2" />

        <polyline points={points} fill="none" stroke={ACCENT} strokeWidth="2" />

        {sessions.map((session, i) => (
          <circle key={`${session.date}-${i}`} cx={x(i)} cy={y(session.weight)} r="4" fill={ACCENT}>
            <title>{`${shortDate(session.date)}: ${session.weight || 0} ${exercise.unit}`}</title>
          </circle>
        ))}

        <text x={x(0)} y={y(first.weight) - 11} textAnchor="start" fill={INK}>
          {first.weight}
        </text>
        <text
          x={x(sessions.length - 1)}
          y={y(last.weight) - 11}
          textAnchor="end"
          fill={INK}
        >
          {last.weight}
        </text>

        <text x={left} y={height - 8} fill={MUTED}>
          {shortDate(first.date)}
        </text>
        <text x={width - right} y={height - 8} textAnchor="end" fill={MUTED}>
          {shortDate(last.date)}
        </text>
      </svg>
      <figcaption className="small muted" style={{ marginTop: 4 }}>
        Working load in {exercise.unit}, last {sessions.length} sessions. Scale runs {lo}–{hi},
        not from zero.
      </figcaption>
    </figure>
  );
}
