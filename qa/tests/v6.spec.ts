import { expect, test } from "@playwright/test";
import { expectNoError, fillExercise, gotoView, saveWorkout, signUp, uniqueEmail } from "./helpers";

test.describe("V6 inputs", () => {
  test("broken form holds the load instead of adding to it", async ({ page }) => {
    await signUp(page, uniqueEmail("form"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 135);
    await page
      .getByRole("group", { name: "Form on Bench Press" })
      .getByRole("button", { name: "Form broke" })
      .click();
    await saveWorkout(page);
    await expectNoError(page);

    // Every set topped out, but with broken form that earns no increase.
    await expect(page.getByText("135 lb × 8 / 8 / 8 / 8")).toBeVisible();
    await expect(page.getByText(/Form broke down last time/)).toBeVisible();
  });

  test("readiness and form survive a save and show when editing", async ({ page }) => {
    await signUp(page, uniqueEmail("readiness"));

    await gotoView(page, "Workout");
    await page.getByRole("button", { name: "Good", exact: true }).click();
    await fillExercise(page, "bench", [6, 6, 6, 6], 135);
    await page
      .getByRole("group", { name: "Form on Bench Press" })
      .getByRole("button", { name: "Form held" })
      .click();
    await saveWorkout(page);

    await gotoView(page, "History");
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page.getByRole("button", { name: "Good", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("group", { name: "Form on Bench Press" }).getByRole("button", { name: "Form held" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expectNoError(page);
  });

  test("a rough day holds targets at last session's numbers", async ({ page }) => {
    await signUp(page, uniqueEmail("rough"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 135);
    await saveWorkout(page);
    await expect(page.getByText("140 lb × 5–8")).toBeVisible();

    await gotoView(page, "Workout");
    await expect(page.locator("#w-bench")).toHaveValue("140");
    await page.getByRole("button", { name: "Rough", exact: true }).click();
    await expect(page.getByText("135 lb × 8 / 8 / 8 / 8")).toBeVisible();
    await expect(page.locator("#w-bench")).toHaveValue("135");
  });

  test("an added set is saved and carried into the next target", async ({ page }) => {
    await signUp(page, uniqueEmail("sets"));

    await gotoView(page, "Workout");
    await page.getByRole("button", { name: "Add a set to Bench Press" }).click();
    await expect(page.locator("#r-bench-4")).toBeVisible();
    await fillExercise(page, "bench", [7, 7, 6, 6, 5], 135);
    await saveWorkout(page);
    await expectNoError(page);

    // Weakest set is the fifth; the plan keeps all five.
    await expect(page.getByText("135 lb × 7 / 7 / 6 / 6 / 6")).toBeVisible();

    await gotoView(page, "Workout");
    await expect(page.locator("#r-bench-4")).toBeVisible();
    await expect(page.locator("#r-bench-5")).toHaveCount(0);
  });

  test("bodyweight can be logged from the dashboard", async ({ page }) => {
    await signUp(page, uniqueEmail("bodyweight"));

    await expect(page.getByText("No bodyweight logged yet.")).toBeVisible();
    await page.getByLabel("Bodyweight (lb)").fill("182.4");
    await page.getByRole("button", { name: "Log weight" }).click();
    await expect(page.getByText(/Last: 182.4 lb/)).toBeVisible();
    await expectNoError(page);
  });
});
