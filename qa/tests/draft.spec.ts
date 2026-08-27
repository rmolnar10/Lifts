import { expect, test } from "@playwright/test";
import { expectNoError, fillExercise, gotoView, saveWorkout, signUp, uniqueEmail } from "./helpers";

/** Regression cover for the bug found in real use: drafts lost on tab change. */
test.describe("In-progress workout drafts", () => {
  test("entries survive navigating away and back", async ({ page }) => {
    await signUp(page, uniqueEmail("draft"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 7, 6, 6], 135);

    await gotoView(page, "History");
    await gotoView(page, "Workout");

    await expect(page.locator("#w-bench")).toHaveValue("135");
    await expect(page.locator("#r-bench-0")).toHaveValue("8");
    await expect(page.locator("#r-bench-3")).toHaveValue("6");
    await expect(page.getByText("Picked up where you left off")).toBeVisible();
    await expectNoError(page);
  });

  test("entries survive a full page reload", async ({ page }) => {
    await signUp(page, uniqueEmail("draft-reload"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [7, 7, 7, 7], 125);

    await page.reload();
    await gotoView(page, "Workout");
    await expect(page.locator("#r-bench-0")).toHaveValue("7");
  });

  test("each day keeps its own draft", async ({ page }) => {
    await signUp(page, uniqueEmail("draft-days"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 135);

    await page.getByRole("button", { name: "Legs + Abs" }).click();
    await fillExercise(page, "squat", [5, 5, 5], 225);

    await page.getByRole("button", { name: "Heavy Upper" }).click();
    await expect(page.locator("#w-bench")).toHaveValue("135");

    await page.getByRole("button", { name: "Legs + Abs" }).click();
    await expect(page.locator("#w-squat")).toHaveValue("225");
  });

  test("'Start fresh' clears the draft", async ({ page }) => {
    await signUp(page, uniqueEmail("draft-clear"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [9, 9, 9, 9], 999);
    await gotoView(page, "History");
    await gotoView(page, "Workout");

    await page.getByRole("button", { name: "Start fresh" }).click();
    await expect(page.getByText("Picked up where you left off")).toHaveCount(0);
    await expect(page.locator("#r-bench-0")).toHaveValue("");
  });

  test("saving clears the draft so the next workout starts clean", async ({ page }) => {
    await signUp(page, uniqueEmail("draft-save"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 135);
    await saveWorkout(page);

    await gotoView(page, "Workout");
    await expect(page.getByText("Picked up where you left off")).toHaveCount(0);
  });
});
