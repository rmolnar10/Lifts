import { defineConfig, devices } from "@playwright/test";

/**
 * @playwright/test is pinned to 1.56.0 in package.json because that is the
 * release whose Chromium revision (1194) matches the browser preinstalled at
 * PLAYWRIGHT_BROWSERS_PATH. A newer Playwright launches with --inspector-pipe,
 * which that Chromium build does not speak, and every test fails at launch.
 * If you bump Playwright, check `browsers.json` and update the image or pin.
 */
const LAUNCH = {
  // Containers run as root, where Chromium's sandbox refuses to start.
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
};

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // One shared database; serial keeps assertions honest.
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.QA_APP_URL ?? "http://127.0.0.1:3210",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: LAUNCH,
  },
  projects: [
    {
      // The app is used on a phone, so QA runs at a phone viewport with touch
      // enabled. Note this is Chromium emulating an iPhone, not real Safari —
      // only Chromium is available here, so genuine WebKit quirks still need a
      // human pass on the device.
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium", launchOptions: LAUNCH },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], launchOptions: LAUNCH },
    },
  ],
});
