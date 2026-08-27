---
name: qa
description: Run the Lifts end-to-end QA suite - a real Chromium driven through the app at phone and desktop viewports, against a throwaway Postgres running the real migrations and RLS. Use when asked to QA, test end to end, verify a change works in the real app, or check for regressions before deploying.
---

# Lifts QA

Drives the actual app in a real browser through `docs/QA_CHECKLIST.md`. Nothing
touches the production Supabase project or the live site.

## Run it

```bash
npm run qa                      # everything, mobile + desktop
npm run qa -- --project=mobile  # phone viewport only (faster)
npm run qa -- qa/tests/draft.spec.ts   # one spec
npm run qa -- -g "progression"         # tests matching a name
```

Takes roughly 90 seconds for the full run.

## What it stands up

`scripts/qa.sh` builds the whole stack per run and tears it down afterwards:

1. **Throwaway PostgreSQL** with `supabase/migrations/*.sql` applied — so the
   schema, the RLS policies and the `save_workout` / `import_backup` RPCs under
   test are the real ones, not mocks.
2. **A Supabase stub** (`qa/stub/supabase-stub.mjs`) implementing only the auth
   and PostgREST routes this app calls, in front of that database. Every request
   runs as the `authenticated` role with `request.jwt.claim.sub` set, so RLS is
   genuinely enforced. Unknown routes return **501**, never an empty array — a
   silent `[]` would let a broken query masquerade as "no data yet".
3. **The app** on `next dev`, pointed at the stub.
4. **Chromium** via Playwright, at an iPhone viewport and a desktop one.

## Reading a failure

- `test-results/<test>/error-context.md` — an accessibility snapshot of the page
  at the moment it failed. Usually enough to diagnose without rerunning.
- `test-results/<test>/test-failed-1.png` — screenshot.
- `test-results/<test>/trace.zip` — full trace.
- `/tmp/lifts-qa-app.log`, `/tmp/lifts-qa-stub.log` — app and stub output.

**Decide whether the app or the test is wrong before changing either.** Both
have happened here: the "Start fresh" button genuinely failed to reset the
inputs, while an "Est. 1RM" assertion failed only because this Chromium reports
`<th>` with the `cell` role rather than `columnheader`. Read the snapshot.

## Pinned versions — do not casually bump

`@playwright/test` is pinned to **1.56.0**: that release's Chromium revision
(1194) is the one preinstalled at `PLAYWRIGHT_BROWSERS_PATH`. Newer Playwright
launches with `--inspector-pipe`, which that build does not speak, and every
test fails at launch. If you bump it, check `playwright-core/browsers.json`
against `ls /opt/pw-browsers` first.

Chromium runs with `--no-sandbox` because the container is root. The dbus errors
in the browser log are noise.

## Coverage, and what it cannot cover

Covered: auth (signup, signin, bad credentials, session across reload, signout),
starting weights, logging a workout, weakest-set progression and the load
increase, edit, delete, derived dashboard/PR/progress data, in-progress drafts,
and that a second account sees none of the first account's data.

Not covered, still needs a human on a real device:

- Real Safari. The mobile project is **Chromium emulating an iPhone**, not
  WebKit — only Chromium is available here.
- Real Supabase auth: confirmation emails, password reset, token refresh.
- Genuine cross-device sync (`docs/QA_CHECKLIST.md` → Cross-device sync).
- Feel: keyboard behaviour, scrolling with the keyboard open, whether a set can
  actually be logged quickly between sets.

Say so plainly when reporting results rather than implying a green run means the
app is fully verified.

## Adding a test

Specs live in `qa/tests/`. Use the helpers in `qa/tests/helpers.ts`
(`signUp`, `gotoView`, `fillExercise`, `saveWorkout`, `expectNoError`) and give
each test its own account via `uniqueEmail(...)` — the suite runs serially
against one database and shared accounts would couple tests together.

Prefer stable DOM locators (`#r-bench-0`, `#w-bench`, `#start-Heavy Upper::bench`)
over role queries for form fields; the ids are deliberate and stable.

## Related

- `npm test` — unit tests, including the V4 progression parity harness
- `npm run test:db` — RLS and RPC tests straight against Postgres, no browser
- `docs/QA_CHECKLIST.md` — the human checklist this suite automates part of
