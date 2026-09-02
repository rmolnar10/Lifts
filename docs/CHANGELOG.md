# Changelog

## Post-V5 fixes
- Volume Upper reworked: incline DB press 4x8-12 -> 5x6-10, and close-grip
  push-ups replaced by an overhead triceps extension 3x10-15. Chest goes from 8
  to 9 direct weekly sets and triceps from 3 to 6, matching biceps.
- Pull-ups no longer show a phantom "0 reps" load, and now progress to external
  weight in 2.5 lb steps once every set reaches 10.
- The set/rep badge reads "4 x 5-8 reps" rather than "4 x 5-8 lb".
- Editing a workout no longer deletes performances for exercises that have since
  left the program.
- Automated end-to-end QA: `npm run qa` drives a real Chromium through the app
  at phone and desktop viewports, against a throwaway Postgres running the real
  migrations and RLS policies. 30 checks.
- Fixed: "Start fresh" cleared the saved draft but left the typed values in the
  form, so the inputs still showed the discarded workout. Found by the new QA
  suite on its first run.
- In-progress workouts are no longer lost when switching tabs. Entries are
  mirrored to this device's storage on every keystroke and restored when you
  come back, with a "Start fresh" escape hatch. Drafts are per account, per day,
  and separate from editing a saved workout; they expire after 7 days and are
  discarded if the program changes underneath them.
- Cancel now confirms before throwing away an in-progress workout.

## V5 — Cloud
- Supabase Auth: sign up, sign in, sign out, sessions that survive reloads
- Supabase PostgreSQL with Row Level Security on every user-owned table
- Workouts, sets, RIR, notes and starting weights persisted in the cloud
- Same data on phone and computer; re-syncs when the tab regains focus
- Transactional save/import/reset via SECURITY INVOKER RPCs
- Next.js + TypeScript project structure, deployable to Vercel
- JSON export/import preserved and still reads V2/V3/V4 backups
- One-click import of data left in this browser by V2/V3/V4
- Duplicate workout submissions prevented while a save is in flight
- Automated test suite, including a parity harness that runs the original V4
  code and asserts identical progression output
- Progression algorithm unchanged from V4 (V6 will revisit it)
- "Reset data" moved from the header into Settings

## V4
- Mobile-first workout logging
- Set-by-set reps
- RIR
- Rest timer
- Workout notes
- Edit/delete workouts
- Exercise history
- Progress charts
- PRs
- Starting weights
- JSON export/import
- V2/V3 localStorage migration
- Rear delt fly removed

## V3
- Dashboard
- Recent workouts
- Workout count
- Logged volume
- PRs
- Load trends
- Estimated 1RM

## V2
- Exercise-specific progression
- Weakest-set progression
- Exercise history
- Starting weights
- Rear delt fly removed

## V1
- Basic workout logging
- Starting weights
- Automatic progression
- Local browser storage
