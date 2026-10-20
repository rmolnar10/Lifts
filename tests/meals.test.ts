import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN,
  localToday,
  mealTotals,
  parsePlan,
  planForDay,
  shiftDay,
  type MealPlan,
} from "@/lib/meals";

const plan = (at: string, dinnerKcal: number): MealPlan => ({
  ...DEFAULT_PLAN,
  at,
  items: DEFAULT_PLAN.items.map((i) => (i.id === "dinner" ? { ...i, kcal: dinnerKcal } : i)),
});

describe("meal checklist", () => {
  it("the default plan is Ryan's 2,300 kcal / 200 g protein day", () => {
    const all = mealTotals(DEFAULT_PLAN, DEFAULT_PLAN.items.map((i) => i.id));
    expect(all).toEqual({ kcal: 2300, protein: 200, done: 7 });
    expect(DEFAULT_PLAN.target).toMatchObject({ kcal: 2300, protein: 200 });
  });

  it("adds up only the ticked meals", () => {
    expect(mealTotals(DEFAULT_PLAN, ["breakfast", "musashi", "gone"])).toEqual({
      kcal: 847,
      protein: 88,
      done: 2,
    });
  });

  it("today follows the newest switcher pick, local or saved", () => {
    const local = plan("2026-10-20T08:00:00Z", 700);
    const saved = [{ day: "2026-10-19", checked: [], plan: plan("2026-10-20T09:00:00Z", 650) }];
    expect(planForDay("2026-10-20", "2026-10-20", saved, local).items[5].kcal).toBe(650);
    expect(planForDay("2026-10-20", "2026-10-20", [], local).items[5].kcal).toBe(700);
    expect(planForDay("2026-10-20", "2026-10-20", [], null)).toBe(DEFAULT_PLAN);
  });

  it("a past day keeps the plan it was ticked against", () => {
    const old = plan("2026-10-10T08:00:00Z", 600);
    const saved = [{ day: "2026-10-18", checked: ["dinner"], plan: old }];
    const local = plan("2026-10-20T08:00:00Z", 700);
    expect(planForDay("2026-10-18", "2026-10-20", saved, local)).toBe(old);
    expect(planForDay("2026-10-17", "2026-10-20", saved, local)).toBe(DEFAULT_PLAN);
  });

  it("rejects anything that isn't a switcher plan", () => {
    expect(parsePlan("not json")).toBeNull();
    expect(parsePlan({ v: 2, items: [] })).toBeNull();
    expect(parsePlan(JSON.stringify(DEFAULT_PLAN))).toEqual(DEFAULT_PLAN);
  });

  it("moves dates across a month end in local time", () => {
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
