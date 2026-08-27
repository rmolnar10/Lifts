import { expect, test } from "@playwright/test";
import { expectNoError, fillExercise, gotoView, saveWorkout, signUp, uniqueEmail } from "./helpers";

test.describe("Logging and progression", () => {
  test("starting weights drive the first target", async ({ page }) => {
    await signUp(page, uniqueEmail("starts"));

    await gotoView(page, "Settings");
    await page.locator('input[id="start-Heavy Upper::bench"]').fill("135");
    await page.getByRole("button", { name: "Save starting weights" }).click();
    await expect(page.locator(".notice.success")).toBeVisible();

    await gotoView(page, "Dashboard");
    await expect(page.getByText("135 lb × 5–8")).toBeVisible();
    await expectNoError(page);
  });

  test("a logged workout drives the next target, and progression advances", async ({ page }) => {
    await signUp(page, uniqueEmail("progress"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 7, 6, 6], 135);
    await page.locator("#workout-notes").fill("first session");
    await saveWorkout(page);
    await expectNoError(page);

    // Weakest set is the first 6, i.e. set 3.
    await expect(page.getByText("135 lb × 8 / 7 / 7 / 6")).toBeVisible();
    await expect(page.getByText("Prioritize Set 3; add one clean rep.")).toBeVisible();

    // Top of range on every set -> load goes up.
    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 135);
    await saveWorkout(page);
    await expect(page.getByText("140 lb × 5–8")).toBeVisible();
    await expect(page.getByText("All sets reached 8. Increase load.")).toBeVisible();
  });

  test("history, PRs and progress all reflect a saved workout", async ({ page }) => {
    await signUp(page, uniqueEmail("derived"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 7, 7], 145);
    await saveWorkout(page);

    await gotoView(page, "History");
    await expect(page.getByRole("cell", { name: "Heavy Upper" })).toBeVisible();

    await gotoView(page, "PRs");
    await expect(page.getByText("145 lb")).toBeVisible();
    await expect(page.getByText("Load PR")).toBeVisible();

    await gotoView(page, "Progress");
    await expect(page.locator("th", { hasText: "Est. 1RM" })).toBeVisible();
    await expectNoError(page);
  });

  test("a workout can be edited and the change sticks", async ({ page }) => {
    await signUp(page, uniqueEmail("edit"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [5, 5, 5, 5], 100);
    await saveWorkout(page);

    await gotoView(page, "History");
    await page.getByRole("button", { name: "Edit" }).first().click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

    await fillExercise(page, "bench", [8, 8, 8, 8], 155);
    await saveWorkout(page);
    await expectNoError(page);

    // Progression recalculates from the edited values.
    await expect(page.getByText("160 lb × 5–8")).toBeVisible();
  });

  test("a workout can be deleted and derived data updates", async ({ page }) => {
    await signUp(page, uniqueEmail("delete"));

    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 185);
    await saveWorkout(page);

    await gotoView(page, "History");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByText("No workouts yet.")).toBeVisible();

    await gotoView(page, "PRs");
    await expect(page.getByText("Complete workouts to create PRs.")).toBeVisible();
    await expectNoError(page);
  });
});
