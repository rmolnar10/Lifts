# Changelog

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
