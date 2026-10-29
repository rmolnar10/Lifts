import { expect, test } from "@playwright/test";
import { expectNoError, gotoView, signUp, uniqueEmail } from "./helpers";

test.describe("Meal checklist", () => {
  test("ticks survive a reload and add up against the target", async ({ page }) => {
    await signUp(page, uniqueEmail("meals"));
    await gotoView(page, "Meals");

    await expect(page.getByText(/^0 of 6 items done/)).toBeVisible();
    await page.getByRole("checkbox", { name: /Oats breakfast/ }).check();
    await page.getByRole("checkbox", { name: /Chicken dinner/ }).check();
    await expect(page.getByText(/^2 of 6 items done/)).toBeVisible();
    // 2,100 Monday to Friday, a 2,800 ceiling on Saturday and Sunday.
    await expect(page.locator(".meter").first()).toContainText(/\/ 2,[18]00 kcal/);
    await expect(page.locator(".meter").first()).toContainText("1,067");
    await expect(page.locator(".meter").nth(1)).toContainText("101");
    await expectNoError(page);

    await page.reload();
    await gotoView(page, "Meals");
    await expect(page.getByRole("checkbox", { name: /Oats breakfast/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Musashi bar/ })).not.toBeChecked();

    // Yesterday is its own day.
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByText("Yesterday")).toBeVisible();
    await expect(page.getByText(/^0 of 6 items done/)).toBeVisible();
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
