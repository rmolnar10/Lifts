"use client";

import { useEffect, useState } from "react";
import { loadMealDays, saveMealChecks } from "@/lib/data";
import {
  localToday,
  mealTotals,
  planForDay,
  readLocalPlan,
  shiftDay,
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

function Meter({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="meter">
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

  async function toggle(id: string) {
    if (!days) return;
    const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
    const before = days;
    const updated: MealDay = { day, checked: next, plan };
    setDays([updated, ...days.filter((d) => d.day !== day)].sort((a, b) => b.day.localeCompare(a.day)));
    try {
      await saveMealChecks(day, next, plan);
      setError(null);
    } catch (e) {
      setDays(before);
      setError(e instanceof Error ? `Could not save meal check: ${e.message}` : "Could not save meal check.");
    }
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
                  {item.detail !== item.label ? <span className="small muted">{item.detail}</span> : null}
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

      {/* Below the list but pinned to the bottom of the screen, so the totals
          stay in view while ticking meals off on a phone. */}
      <div className="meal-totals">
        <Meter label="Calories" value={totals.kcal} target={plan.target.kcal} unit="kcal" />
        <Meter label="Protein" value={totals.protein} target={plan.target.protein} unit="g" />
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {totals.done} of {plan.items.length} meals done
          {totals.done === plan.items.length ? " · day complete" : ""}
        </p>
      </div>

      <p className="small muted" style={{ marginBottom: 0 }}>
        {day === today ? (
          <>
            Chicken, turkey and rice follow your picks in the <a href="/meals">Meal switcher</a> (target:{" "}
            {plan.target.label.toLowerCase()}).
          </>
        ) : (
          "Past days keep the meals they were ticked against."
        )}
      </p>
    </div>
  );
}
