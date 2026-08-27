import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, signUp, uniqueEmail } from "./helpers";

test.describe("Auth", () => {
  test("signed-out visitors are sent to the login screen", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("sign up, reload, and sign out", async ({ page }) => {
    const email = uniqueEmail("auth");
    await signUp(page, email);

    // Session survives a reload.
    await page.reload();
    await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // And the app is properly locked again.
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("invalid credentials are rejected with a message", async ({ page }) => {
    const email = uniqueEmail("bad");
    await signUp(page, email);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.locator(".notice.error")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("signing back in returns the same data", async ({ page }) => {
    const email = uniqueEmail("persist");
    await signUp(page, email);
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, email);
    await expect(page.getByRole("heading", { name: "Next workout" })).toBeVisible();
  });
});
