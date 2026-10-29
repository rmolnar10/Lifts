"use client";

import { useEffect, useState } from "react";
import { loadMealDays, saveMealChecks } from "@/lib/data";
import {
  EXTRA_PRESETS,
  addExtra,
  isWeekend,
  localToday,
  mealTotals,
  planForDay,
  readLocalPlan,
  removeItem,
  shiftDay,
  targetForDay,
  type MealDay,
  type MealPlan,
} from "@/lib/meals";

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Meter({
  label,
  value,
  target,
  unit,
  ceiling = false,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  ceiling?: boolean;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className={ceiling && value > target ? "meter over" : "meter"}>
      <div className="row small">
        <span>{label}</span>
        <span>
          <b>{value.toLocaleString()}</b> / {target.toLocaleString()} {unit}
        </span>
      </div>
      <div className="meter-bar" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemax={target}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Daily meal checklist: tick off each of the day's fixed meals and watch kcal
 * and protein add up against the target.
 */
export default function MealsView({ setError }: { setError: (error: string | null) => void }) {
  const today = localToday();
  const [day, setDay] = useState(today);
  const [days, setDays] = useState<MealDay[] | null>([]);
  const [local, setLocal] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLocal(readLocalPlan());
    loadMealDays()
      .then(setDays)
      .catch((e) =>
        setError(e instanceof Error ? `Could not load meal checks: ${e.message}` : "Could not load meal checks."),
      )
      .finally(() => setLoading(false));
  }, [setError]);

  if (loading) return <div className="card muted">Loading your meals…</div>;

  if (days === null) {
    return (
      <div className="card">
        <h3>Meals</h3>
        <p className="muted small">
          The meal checklist switches on once the database update (<code>0007_meal_checks.sql</code>) is
          applied.
        </p>
      </div>
    );
  }

  const plan = planForDay(day, today, days, local);
  const checked = days.find((d) => d.day === day)?.checked ?? [];
  const totals = mealTotals(plan, checked);
  const target = targetForDay(plan, day);
  const weekend = Boolean(plan.target.weekend) && isWeekend(day);
  const left = target.kcal - totals.kcal;

  async function save(next: string[], nextPlan: MealPlan) {
    if (!days) return;
    const before = days;
    const updated: MealDay = { day, checked: next, plan: nextPlan };
    setDays([updated, ...days.filter((d) => d.day !== day)].sort((a, b) => b.day.localeCompare(a.day)));
    try {
      await saveMealChecks(day, next, nextPlan);
      setError(null);
    } catch (e) {
      setDays(before);
      setError(e instanceof Error ? `Could not save meal check: ${e.message}` : "Could not save meal check.");
    }
  }

  function toggle(id: string) {
    const item = plan.items.find((i) => i.id === id);
    // Unticking a drink or extra takes it off the day altogether.
    if (item?.extra) return save(checked.filter((c) => c !== id), removeItem(plan, id));
    const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
    return save(next, plan);
  }

  function logExtra(extra: { label: string; kcal: number; protein: number }) {
    const id = `extra-${Date.now()}`;
    return save([...checked, id], addExtra(plan, extra, id));
  }

  return (
    <div className="card">
      <div className="row">
        <h3 style={{ margin: 0 }}>Meals</h3>
        <div className="row" style={{ gap: 6 }}>
          <button aria-label="Previous day" onClick={() => setDay(shiftDay(day, -1))}>
            ‹
          </button>
          <b style={{ minWidth: 90, textAlign: "center" }}>{dayLabel(day, today)}</b>
          <button aria-label="Next day" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= today}>
            ›
          </button>
        </div>
      </div>

      <ul className="meal-list" style={{ marginTop: 10 }}>
        {plan.items.map((item) => {
          const on = checked.includes(item.id);
          return (
            <li key={item.id}>
              <label className={on ? "meal done" : "meal"}>
                <input type="checkbox" checked={on} onChange={() => void toggle(item.id)} />
                <span className="meal-text">
                  <b>{item.label}</b>
                  {item.extra ? (
                    <span className="small muted">Extra · untick to remove</span>
                  ) : item.detail !== item.label ? (
                    <span className="small muted">{item.detail}</span>
                  ) : null}
                </span>
                <span className="small meal-macros">
                  {item.kcal} kcal
                  <br />
                  {item.protein} g P
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="meal-extras">
        <span className="small muted">{weekend ? "Drinks and extras" : "Extras"}</span>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-start" }}>
          {EXTRA_PRESETS.map((x) => (
            <button key={x.label} className="small" onClick={() => void logExtra(x)}>
              + {x.label} · {x.kcal}
            </button>
          ))}
          <button
            className="small"
            onClick={() => {
              const kcal = Number(window.prompt("Calories for the extra food or drink?"));
              if (Number.isFinite(kcal) && kcal > 0) void logExtra({ label: "Other", kcal: Math.round(kcal), protein: 0 });
            }}
          >
            + Other…
          </button>
        </div>
      </div>

      {/* Below the list but pinned to the bottom of the screen, so the totals
          stay in view while ticking meals off on a phone. */}
      <div className="meal-totals">
        <Meter label={weekend ? "Calories (weekend ceiling)" : "Calories"} value={totals.kcal} target={target.kcal} unit="kcal" ceiling={weekend} />
        <Meter label="Protein" value={totals.protein} target={target.protein} unit="g" />
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {totals.done} of {plan.items.length} {plan.items.length === 1 ? "item" : "items"} done
          {weekend
            ? left >= 0
              ? ` · ${left.toLocaleString()} kcal left before ${target.kcal.toLocaleString()}`
              : ` · ${(-left).toLocaleString()} kcal over ${target.kcal.toLocaleString()}; eat the weekday day tomorrow`
            : totals.done === plan.items.length
              ? " · day complete"
              : ""}
        </p>
      </div>

      <p className="small muted" style={{ marginBottom: 0 }}>
        {day === today ? (
          <>
            Chicken, turkey and rice follow your picks in the <a href="/meals">Meal switcher</a> (target:{" "}
            {target.label.toLowerCase()}).
          </>
        ) : (
          "Past days keep the meals they were ticked against."
        )}
      </p>
    </div>
  );
}
