"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Timestamp (ms) the current rest period ends at, or null when idle. */
  endsAt: number | null;
  onStop: () => void;
}

/**
 * Sticky rest timer, ported from V4. Counts down from the exercise's rest
 * default and stays on screen with a "Rest complete" message until dismissed.
 */
export default function RestTimer({ endsAt, onStop }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (endsAt === null) return null;

  const left = Math.max(0, endsAt - now);

  if (left === 0) {
    return (
      <div className="stickyBottom">
        <div className="timer">
          <span>Rest complete ✓</span>
          <button onClick={onStop}>Dismiss</button>
        </div>
      </div>
    );
  }

  const seconds = Math.ceil(left / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");

  return (
    <div className="stickyBottom">
      <div className="timer">
        <span>
          {minutes}:{rest}
        </span>
        <button onClick={onStop}>Stop</button>
      </div>
    </div>
  );
}
