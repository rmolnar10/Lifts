import { expect, test } from "@playwright/test";
import { expectNoError, gotoView, signUp, uniqueEmail } from "./helpers";

test.describe("Meal checklist", () => {
  test("ticks survive a reload and add up against the target", async ({ page }) => {
    await signUp(page, uniqueEmail("meals"));
    await gotoView(page, "Meals");

    await expect(page.getByText("0 of 7 meals done")).toBeVisible();
    await page.getByRole("checkbox", { name: /Oats breakfast/ }).check();
    await page.getByRole("checkbox", { name: /Chicken dinner/ }).check();
    await expect(page.getByText("2 of 7 meals done")).toBeVisible();
    await expect(page.getByText("/ 2,300 kcal")).toBeVisible();
    await expect(page.locator(".meter").first()).toContainText("1,149");
    await expect(page.locator(".meter").nth(1)).toContainText("103");
    await expectNoError(page);

    await page.reload();
    await gotoView(page, "Meals");
    await expect(page.getByRole("checkbox", { name: /Oats breakfast/ })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: /Musashi bar/ })).not.toBeChecked();

    // Yesterday is its own day.
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByText("Yesterday")).toBeVisible();
    await expect(page.getByText("0 of 7 meals done")).toBeVisible();
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
