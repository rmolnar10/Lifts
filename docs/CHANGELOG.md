# Changelog

## Post-V5 fixes
- Program restructured around the real priorities (2026-10-09):
  - Lower-body hypertrophy dropped. The stated priority is hip mobility and
    pelvic-floor control; a loaded leg day serves that poorly, heavy bracing can
    raise resting tone in a hypertonic floor, and in six weeks exactly one of
    twelve sessions was a leg day. The Legs + Abs day is gone; its history is
    preserved and still shows in History and the export.
  - Two gym days carry all the hypertrophy work. Chest 9 -> 11 direct sets via a
    new Cable Fly 3x10-15 and incline 5 -> 4 sets (the 5th set was always the
    weakest and gated every load increase). Heavy Upper pull-ups 4 -> 3, Volume
    Upper cable row 3 -> 2. Arms stay at 6 sets each. Back 13 -> 11.
  - Hanging Leg Raise moved to Volume Upper so core work survives a skipped day.
  - Four non-progressing days added from the user's own routines: Functional
    Lower, Hip Mobility, Pelvic Floor and Cardio. They are logged but never
    load-progressed, and a 'min' unit was added for zone 2 work.
  - The deload reminder now counts strength sessions only. Counting mobility and
    cardio would have fired it two or three times as often as intended.
  - A workout logged under a day the program no longer has now explains itself
    instead of showing an empty form the user could save over their history with.
  - The V4 parity suite still proves the engine is unchanged; its drift half now
    tracks retired and added days as well as per-exercise changes.
- Progress tab rebuilt around "what do I change next" (2026-10-03):
  - A "What to change next session" list naming every lift that is ready for
    more load or has stalled, with the specific instruction for each: which set
    is blocking, how many reps it is short, and whether a first set taken to
    failure is the cause.
  - A reps-per-set chart with the top of the rep range drawn in, so it is
    visible that the engine raises load only once EVERY set clears that line.
  - A load-over-time line, shown only when the load has actually moved.
  - A short explainer of how the progression rule works.
  - The exercise selector opens on the lift most in need of attention rather
    than the first in the program.
- Deload reminder every 7 workouts, on the Dashboard and the Workout view.
  `DELOAD_EVERY_N_WORKOUTS` in src/lib/deload.ts is the only number to change.
- Upper-body effort targets, dropsets and supersets:
  - RPE 8-9 on compounds, 9-10 on isolation, shown as RIR on the exercise card.
  - Dropset on the last set of both lateral raises, both triceps movements and
    both curls.
  - Triceps pushdown + machine curl, and hammer curl + overhead extension, are
    now superset pairs (A1/A2) with no rest between them.
  - Lower body is deliberately untouched.
- Volume Upper returns to Hammer Curl 3x8-12 (its history reconnects), and
  Heavy Upper's curl is renamed Machine Curl to match the equipment used.
- Routine update (2026-10-03):
  - Heavy Upper pull-ups corrected from "Weighted Pull-Up" to a bodyweight
    "Pull-Up" at 4x5-10. They had always been done at bodyweight but logged as
    165 lb (the lifter's bodyweight), which made every suggestion wrong. The
    five affected history entries and the starting weight were reset to 0 lb,
    so the exercise now reads "Bodyweight" and will switch to 2.5 lb steps once
    all four sets reach 10.
  - Lateral raises moved to 8-15 on both days (were 12-20 and 15-20).
  - Hammer Curl on Volume Upper replaced by Bayesian Cable Curl 3x10-15. The
    hammer-curl history is retained and still shows in History and Progress.
  - Renames to match the equipment actually used: Cable Row -> Seated Cable Row,
    Curl -> DB Curl, Incline DB Press -> Incline Smith Machine Bench Press.
  - Weekly set counts are unchanged at 58; only rep ranges and names moved.
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
