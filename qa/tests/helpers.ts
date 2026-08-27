import { expect, type Page } from "@playwright/test";

/** Each spec gets its own account so runs never interfere with one another. */
export function uniqueEmail(label: string): string {
  return `qa-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export const PASSWORD = "qa-password-123";

export async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
}

export async function gotoView(page: Page, view: string): Promise<void> {
  await page.locator(".nav").getByRole("button", { name: view, exact: true }).click();
}

/** Fills every set of one exercise, plus its weight when it takes one. */
export async function fillExercise(
  page: Page,
  exerciseId: string,
  reps: number[],
  weight?: number,
): Promise<void> {
  if (weight !== undefined) {
    await page.locator(`#w-${exerciseId}`).fill(String(weight));
  }
  for (const [index, value] of reps.entries()) {
    await page.locator(`#r-${exerciseId}-${index}`).fill(String(value));
  }
}

export async function saveWorkout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Finish & save workout|Save changes/ }).click();
  await expect(page.getByRole("heading", { name: "Next workout" })).toBeVisible();
}

/** Fails the test if the app surfaced an error banner. */
export async function expectNoError(page: Page): Promise<void> {
  await expect(page.locator(".notice.error")).toHaveCount(0);
}
