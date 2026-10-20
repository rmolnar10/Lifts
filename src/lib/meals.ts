/**
 * Daily meal checklist. The meal switcher (public/meals.html) decides what the
 * day's meals are and writes them to localStorage; this ticks them off per day
 * and adds up what has been eaten so far.
 */

export interface MealItem {
  id: string;
  label: string;
  detail: string;
  kcal: number;
  protein: number;
}

export interface MealPlan {
  v: 1;
  /** When the switcher last changed the plan. Newer wins across devices. */
  at: string;
  target: { label: string; kcal: number; protein: number };
  items: MealItem[];
}

export interface MealDay {
  day: string;
  checked: string[];
  plan: MealPlan | null;
}

/** Key the meal switcher writes its current day to. */
export const PLAN_STORAGE_KEY = "mealChecklistPlan";

/**
 * Ryan's current day (2,300 kcal, 200 g protein), exactly as the switcher
 * builds it with its defaults. Used until the switcher has been opened.
 */
export const DEFAULT_PLAN: MealPlan = {
  v: 1,
  at: "1970-01-01T00:00:00.000Z",
  target: { label: "Your current day", kcal: 2300, protein: 200 },
  items: [
    {
      id: "breakfast",
      label: "Oats breakfast",
      detail:
        "Rolled oats, ¾ cup dry (61 g) · 2% milk, ¾ cup (183 g) · Ground flax, 1 tbsp (7 g) · Chia, 1 tbsp (12 g) · Whey isolate, 1 scoop",
      kcal: 527,
      protein: 42,
    },
    { id: "musashi", label: "Musashi bar", detail: "Musashi bar", kcal: 320, protein: 46 },
    { id: "uncrustable", label: "Uncrustable", detail: "Uncrustable PB & grape, 1 (57 g)", kcal: 210, protein: 6 },
    {
      id: "ricecakes",
      label: "Rice cakes + PB",
      detail: "Rice cakes, 2 (50 kcal each) · Natural peanut butter, 2 tbsp (32 g), weighed",
      kcal: 291,
      protein: 8,
    },
    {
      id: "turkey",
      label: "Turkey meal",
      detail: "Plain 99%, 4 oz cooked (weighed) · Broccoli, 156 g",
      kcal: 212,
      protein: 37,
    },
    {
      id: "dinner",
      label: "Chicken dinner",
      detail: "Plain, 6 oz cooked (weighed) · Your white rice (weighed dry), 92 g dry",
      kcal: 622,
      protein: 61,
    },
    { id: "oil", label: "Olive oil", detail: "Olive oil, 1.0 tbsp (13 g)", kcal: 118, protein: 0 },
  ],
};

/** Today as YYYY-MM-DD in the lifter's own timezone, not UTC. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Moves a YYYY-MM-DD date by whole days. */
export function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + by);
  return localToday(d);
}

/** Accepts only a plan shaped like the switcher writes it. */
export function parsePlan(value: unknown): MealPlan | null {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!raw || typeof raw !== "object") return null;
  const plan = raw as Partial<MealPlan>;
  if (plan.v !== 1 || !Array.isArray(plan.items) || !plan.target) return null;
  const ok = plan.items.every(
    (i) => i && typeof i.id === "string" && Number.isFinite(i.kcal) && Number.isFinite(i.protein),
  );
  return ok ? (plan as MealPlan) : null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The plan the switcher left on this device, if any. */
export function readLocalPlan(): MealPlan | null {
  try {
    return parsePlan(window.localStorage.getItem(PLAN_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Which plan a day is checked against. A past day keeps the plan it was saved
 * with. Today follows the switcher: the newest of this device's pick and the
 * newest plan saved from any device.
 */
export function planForDay(
  day: string,
  today: string,
  saved: MealDay[],
  local: MealPlan | null,
): MealPlan {
  const own = saved.find((d) => d.day === day)?.plan ?? null;
  if (day < today) return own ?? DEFAULT_PLAN;

  const candidates = [local, ...saved.map((d) => d.plan)].filter(
    (p): p is MealPlan => p !== null,
  );
  candidates.sort((a, b) => b.at.localeCompare(a.at));
  return candidates[0] ?? DEFAULT_PLAN;
}

export interface MealTotals {
  kcal: number;
  protein: number;
  done: number;
}

export function mealTotals(plan: MealPlan, checked: string[]): MealTotals {
  const eaten = plan.items.filter((i) => checked.includes(i.id));
  return {
    kcal: eaten.reduce((sum, i) => sum + i.kcal, 0),
    protein: eaten.reduce((sum, i) => sum + i.protein, 0),
    done: eaten.length,
  };
}
