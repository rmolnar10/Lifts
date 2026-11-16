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
  /** A drink or extra food logged on the day rather than planned by the switcher. */
  extra?: boolean;
}

export interface MealTarget {
  label: string;
  kcal: number;
  protein: number;
}

export interface MealPlan {
  v: 1;
  /** When the switcher last changed the plan. Newer wins across devices. */
  at: string;
  target: MealTarget & {
    /** Saturday and Sunday ceiling for the same meals, when the phase has one. */
    weekend?: MealTarget;
  };
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
 * Plans the switcher wrote before the 1,900 kcal cut (2026-11-16) still list the
 * Uncrustable and olive oil and the old 2,100 / 2,800 targets. Today ignores them;
 * past days keep the plan they were ticked against.
 */
export const PLAN_EPOCH = "2026-11-16T00:00:00.000Z";

/**
 * Ryan's cut day (confirmed 2026-11-16), exactly as the switcher builds it with
 * its defaults: plain chicken with 92 g dry rice, 4 oz turkey with broccoli, two
 * 35 kcal rice cakes. 1,964 kcal and 192 g protein against 1,900 / 180 every
 * day, weekends and drinks included. Used until the switcher has been opened.
 */
export const DEFAULT_PLAN: MealPlan = {
  v: 1,
  at: PLAN_EPOCH,
  target: { label: "Cut", kcal: 1900, protein: 180 },
  items: [
    {
      id: "breakfast",
      label: "Oats breakfast",
      detail:
        "Bob's Red Mill old fashioned oats, ¾ cup dry (60 g) · 2% milk, ¾ cup (183 g) · Chia seed, 1 tbsp (12 g) · Flaxseed meal, 1 tbsp (7 g) · ON Gold Standard whey, 1 scoop (31 g)",
      kcal: 530,
      protein: 41,
    },
    { id: "musashi", label: "Musashi bar", detail: "Musashi High Protein bar, choc PB", kcal: 340, protein: 45 },
    {
      id: "ricecakes",
      label: "Rice cakes + PB",
      detail: "Rice cakes, 2 (35 kcal each) · Natural peanut butter, 2 tbsp (32 g), weighed",
      kcal: 261,
      protein: 9,
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
      kcal: 621,
      protein: 61,
    },
  ],
};

/**
 * One-tap evening snacks, drinks and extras, with typical label calories. On the
 * cut they all count inside the 1,900; about 27 g less dry rice pays for 100 kcal.
 */
export const EXTRA_PRESETS: { label: string; kcal: number; protein: number }[] = [
  { label: "Greek yogurt", kcal: 100, protein: 17 },
  { label: "Cottage cheese", kcal: 90, protein: 12 },
  { label: "Popcorn", kcal: 93, protein: 3 },
  { label: "Light beer", kcal: 100, protein: 1 },
  { label: "Regular beer", kcal: 150, protein: 1 },
  { label: "IPA", kcal: 250, protein: 2 },
  { label: "Seltzer or spirit", kcal: 100, protein: 0 },
  { label: "Cocktail", kcal: 250, protein: 0 },
];

export function isWeekend(day: string): boolean {
  const weekday = new Date(`${day}T12:00:00`).getDay();
  return weekday === 0 || weekday === 6;
}

/** The target a day is held to: the weekend ceiling on Saturday and Sunday when the plan has one. */
export function targetForDay(plan: MealPlan, day: string): MealTarget {
  const { weekend, ...weekday } = plan.target;
  return weekend && isWeekend(day) ? weekend : weekday;
}

/** Adds a drink or extra food to a day's plan and returns its id, so it can be ticked. */
export function addExtra(
  plan: MealPlan,
  extra: { label: string; kcal: number; protein: number },
  id: string,
): MealPlan {
  const item: MealItem = { id, label: extra.label, detail: "Extra", kcal: extra.kcal, protein: extra.protein, extra: true };
  return { ...plan, items: [...plan.items, item] };
}

export function removeItem(plan: MealPlan, id: string): MealPlan {
  return { ...plan, items: plan.items.filter((i) => i.id !== id) };
}

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
    (p): p is MealPlan => p !== null && p.at >= PLAN_EPOCH,
  );
  candidates.sort((a, b) => b.at.localeCompare(a.at));
  const base = candidates[0] ?? DEFAULT_PLAN;
  // Extras belong to the day they were logged on, whichever plan the meals come from.
  const extras = own?.items.filter((i) => i.extra) ?? [];
  const meals = base.items.filter((i) => !i.extra);
  if (extras.length === 0 && meals.length === base.items.length) return base;
  return { ...base, items: [...meals, ...extras] };
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
