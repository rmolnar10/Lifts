import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectNoError, fillExercise, gotoView, saveWorkout, signUp, uniqueEmail } from "./helpers";

const FIXTURE = path.join(process.cwd(), "qa", "fixtures", "test-program.json");

/** Importing a second program must not mix its history with the first. */
test.describe("Multiple programs", () => {
  test("a second program keeps its own days, history and targets", async ({ page }) => {
    await signUp(page, uniqueEmail("programs"));

    // With one program there is nothing to choose, so no picker.
    await expect(page.locator("#program-select")).toHaveCount(0);

    // Log against the built-in program.
    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 185);
    await saveWorkout(page);
    await expect(page.getByText("190 lb × 5–8")).toBeVisible();

    // Import a second program.
    await gotoView(page, "Settings");
    await page.locator("#program-import").setInputFiles(FIXTURE);
    await expect(page.locator(".notice.success")).toContainText("imported");

    // The picker appears once there is a choice.
    await expect(page.locator("#program-select")).toBeVisible();
    await page.locator("#program-select").selectOption({ label: "QA Test Program" });

    // Its own days, and none of the other program's history.
    await expect(page.getByRole("button", { name: "Push Day" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Heavy Upper" })).toHaveCount(0);
    await gotoView(page, "History");
    await expect(page.getByText("No workouts yet.")).toBeVisible();
    await expectNoError(page);

    // Weeks drive which block is shown.
    await expect(page.locator("#week-select")).toBeVisible();
    await gotoView(page, "Workout");
    await expect(page.locator("#w-qa_press")).toBeVisible();
    await page.locator("#week-select").selectOption("3");
    await gotoView(page, "Workout");
    await expect(page.locator("#w-qa_bench")).toBeVisible();
    await expect(page.locator("#w-qa_press")).toHaveCount(0);

    // Switching back finds the original history untouched.
    await page.locator("#program-select").selectOption({ label: "Lifts 3-Day" });
    await gotoView(page, "History");
    await expect(page.getByRole("cell", { name: "Heavy Upper" })).toBeVisible();
    await gotoView(page, "Dashboard");
    await expect(page.getByText("190 lb × 5–8")).toBeVisible();
    await expectNoError(page);
  });

  test("program metadata renders on the exercise card", async ({ page }) => {
    await signUp(page, uniqueEmail("meta"));
    await gotoView(page, "Settings");
    await page.locator("#program-import").setInputFiles(FIXTURE);
    await expect(page.locator(".notice.success")).toContainText("imported");

    await page.locator("#program-select").selectOption({ label: "QA Test Program" });
    await gotoView(page, "Workout");

    // RPE target shown as reps in reserve, plus dropset and superset markers.
    await expect(page.getByText("1–2 RIR").first()).toBeVisible();
    await expect(page.getByText("Dropset").first()).toBeVisible();
    await expect(page.getByText("Superset").first()).toBeVisible();
    await expect(page.getByText("aim for 0 RIR").first()).toBeVisible();
  });
});
