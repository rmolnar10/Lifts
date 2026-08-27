import { expect, test } from "@playwright/test";
import { fillExercise, gotoView, saveWorkout, signUp, uniqueEmail } from "./helpers";

test.describe("User isolation", () => {
  test("a second account sees none of the first account's data", async ({ page }) => {
    await signUp(page, uniqueEmail("iso-a"));
    await gotoView(page, "Workout");
    await fillExercise(page, "bench", [8, 8, 8, 8], 315);
    await saveWorkout(page);

    await gotoView(page, "History");
    await expect(page.getByRole("cell", { name: "Heavy Upper" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await signUp(page, uniqueEmail("iso-b"));

    await gotoView(page, "History");
    await expect(page.getByText("No workouts yet.")).toBeVisible();

    await gotoView(page, "Dashboard");
    await expect(page.getByText("315")).toHaveCount(0);
  });
});
