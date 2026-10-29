import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN,
  addExtra,
  isWeekend,
  localToday,
  mealTotals,
  parsePlan,
  planForDay,
  shiftDay,
  targetForDay,
  type MealPlan,
} from "@/lib/meals";

const plan = (at: string, dinnerKcal: number): MealPlan => ({
  ...DEFAULT_PLAN,
  at,
  items: DEFAULT_PLAN.items.map((i) => (i.id === "dinner" ? { ...i, kcal: dinnerKcal } : i)),
});

describe("meal checklist", () => {
  it("the default plan is Ryan's 2,100 kcal Phase 1 weekday", () => {
    const all = mealTotals(DEFAULT_PLAN, DEFAULT_PLAN.items.map((i) => i.id));
    expect(all).toEqual({ kcal: 2100, protein: 198, done: 6 });
    expect(DEFAULT_PLAN.target).toMatchObject({ kcal: 2100, protein: 160, weekend: { kcal: 2800 } });
  });

  it("Saturday and Sunday are held to the weekend ceiling", () => {
    expect(isWeekend("2026-10-31")).toBe(true); // Saturday
    expect(isWeekend("2026-11-01")).toBe(true); // Sunday
    expect(isWeekend("2026-11-02")).toBe(false);
    expect(targetForDay(DEFAULT_PLAN, "2026-10-31").kcal).toBe(2800);
    expect(targetForDay(DEFAULT_PLAN, "2026-10-30").kcal).toBe(2100);
    const flat: MealPlan = { ...DEFAULT_PLAN, target: { label: "Phase 2", kcal: 2900, protein: 160 } };
    expect(targetForDay(flat, "2026-10-31").kcal).toBe(2900);
  });

  it("extras stay on today even when the switcher's plan is newer", () => {
    const withBeer = addExtra(plan("2026-10-20T08:00:00Z", 540), { label: "IPA", kcal: 250, protein: 2 }, "extra-1");
    const saved = [{ day: "2026-10-31", checked: ["extra-1"], plan: withBeer }];
    const local = plan("2026-10-31T09:00:00Z", 600);
    const today = planForDay("2026-10-31", "2026-10-31", saved, local);
    expect(today.items.find((i) => i.id === "dinner")?.kcal).toBe(600);
    expect(mealTotals(today, ["extra-1"]).kcal).toBe(250);
    // A different day doesn't inherit them.
    expect(planForDay("2026-11-01", "2026-11-01", saved, local).items.some((i) => i.extra)).toBe(false);
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
