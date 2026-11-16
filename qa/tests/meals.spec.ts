import { expect, test } from "@playwright/test";
import { expectNoError, gotoView, signUp, uniqueEmail } from "./helpers";

test.describe("Meal checklist", () => {
  test("ticks survive a reload and add up against the target", async ({ page }) => {
    await signUp(page, uniqueEmail("meals"));
    await gotoView(page, "Meals");

    await expect(page.getByText(/^0 of 5 items done/)).toBeVisible();
    await page.getByRole("checkbox", { name: /Oats breakfast/ }).check();
    await page.getByRole("checkbox", { name: /Chicken dinner/ }).check();
    await expect(page.getByText(/^2 of 5 items done/)).toBeVisible();
    // 1,900 every day on the cut, weekends included.
    await expect(page.locator(".meter").first()).toContainText("/ 1,900 kcal");
    await expect(page.locator(".meter").first()).toContainText("1,151");
    await expect(page.locator(".meter").nth(1)).toContainText("102");
    await expect(page.getByRole("checkbox", { name: /Uncrustable/ })).toHaveCount(0);
    await expectNoError(page);

    await page.reload();
    await gotoView(page, "Meals");
    await expect(page.getByRole("checkbox", { name: /Oats breakfast/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Musashi bar/ })).not.toBeChecked();

    // Yesterday is its own day.
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByText("Yesterday")).toBeVisible();
    await expect(page.getByText(/^0 of 5 items done/)).toBeVisible();
  });

  test("a beer is logged as an extra and unticking removes it", async ({ page }) => {
    await signUp(page, uniqueEmail("meals-extra"));
    await gotoView(page, "Meals");
    await page.getByRole("button", { name: /Light beer/ }).click();
    await expect(page.getByRole("checkbox", { name: /Light beer/ })).toBeChecked();
    await expect(page.locator(".meter").first()).toContainText("100");
    await page.reload();
    await gotoView(page, "Meals");
    // Unticking removes the row, so click rather than uncheck (which waits for an unchecked box).
    await page.getByRole("checkbox", { name: /Light beer/ }).click();
    await expect(page.getByRole("checkbox", { name: /Light beer/ })).toHaveCount(0);
    await expectNoError(page);
  });

  test("an evening snack picked in the switcher comes out of the dinner rice", async ({ page }) => {
    await signUp(page, uniqueEmail("meals-snack"));
    await page.goto("/meals");
    await page.locator("#snack").selectOption("yog");
    await expect(page.locator("#dayTable")).toContainText("65 g dry");
    await page.goto("/");
    await gotoView(page, "Meals");
    await expect(page.getByRole("checkbox", { name: /Evening snack/ })).toBeVisible();
    await expect(page.getByText(/^0 of 6 items done/)).toBeVisible();
    await expectNoError(page);
  });

  test("the dinner follows the chicken picked in the switcher", async ({ page }) => {
    await signUp(page, uniqueEmail("meals-switch"));
    await page.goto("/meals");
    await page.locator("#chicken").selectOption("buffalo");
    await page.goto("/");
    await gotoView(page, "Meals");
    await expect(page.getByRole("checkbox", { name: /Chicken dinner/ })).toBeVisible();
    await expect(page.locator(".meal", { hasText: "Chicken dinner" })).toContainText("Buffalo");
    await expectNoError(page);
  });
});
