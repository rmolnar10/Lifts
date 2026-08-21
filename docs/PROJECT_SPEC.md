# Lifts — Claude Development Handoff

## What this package contains

This package contains BOTH:
1. The actual V4 working prototype code (`v4/index.html`)
2. The complete project context/specification needed to continue development

Do not recreate the app from the specification alone. Start by inspecting and running the V4 code.

GitHub repo:
https://github.com/rmolnar10/Lifts

The GitHub repository may currently be empty. The goal is to move the V4 implementation into that repository and build V5 from it.

---

## Product

"Lifts" is a personal workout tracking web app.

Core goal:
- Track lifting workouts
- Enter actual reps/weights
- Automatically calculate progressive-overload targets
- Track history, PRs, strength trends, and volume
- Eventually act like a lightweight personal strength/hypertrophy coach

Primary fitness goal:
Build muscle, improve chest development, stay lean/athletic.

Product philosophy:
Simple for the user, sophisticated underneath.

The user should be able to open the app and immediately see what weight/reps to target without understanding the underlying algorithm.

---

# CURRENT WORKOUT PROGRAM

## Day 1 — Heavy Upper

1. Bench — 4×5–8
2. Weighted pull-up — 4×5–8
3. Cable row — 3×8–12
4. DB shoulder press — 3×6–10
5. Lateral raise — 3×12–20
6. Triceps pushdown — 3×10–15
7. Curl — 3×8–12

## Day 2 — Volume Upper

1. Incline DB press — 4×8–12
2. Pull-up — 3×6–10
3. Cable row — 3×10–15
4. Lateral raise — 3×15–20
5. Hammer curl — 3×8–12
6. Optional close-grip push-ups — 2×near failure

IMPORTANT: Rear delt fly has been removed.

## Day 3 — Legs + Abs

1. Squat — 3×5–8
2. RDL — 3×8–12
3. Leg curl — 3×10–15
4. Hanging leg raise — 3×8–15
5. Side plank — 2×30–60 sec/side
6. Reverse Kegel practice — 2–3 min

Cardio is currently OUTSIDE the app:
- 2×/week 45-minute Zone 2 walks
- 7k steps on other 3 weekdays
Do not add cardio tracking unless explicitly requested.

---

# PROGRESSION ENGINE

This is the most important product logic.

Do NOT use a generic "beat your previous total reps" rule.

The progression engine is exercise-specific.

General rule:
- Work toward the top of the rep range on EVERY required set.
- Identify the weakest set.
- Prioritize adding a clean rep to the weakest set.
- Once every required set reaches the top of the range, increase weight.
- After increasing weight, allow reps to reset toward the bottom of the range.
- Do not demand an exact rep pattern after a weight increase.

Example bench:
135 × 8 / 7 / 6 / 6
Next target:
135 × 8 / 8 / 7 / 7
Then:
135 × 8 / 8 / 8 / 7
Then:
135 × 8 / 8 / 8 / 8
Then increase load.

The app should say something like:
"Prioritize Set 4: add one clean rep."

rather than:
"Beat 29 total reps."

---

# EXERCISE-SPECIFIC RULES

## Bench Press
4×5–8
Primary compound.

- Weakest-set progression
- Increase weight only after 8/8/8/8
- Increase approximately 5 lb
- Reset target toward 5–6 reps
- Track strength separately from simple volume

## Weighted Pull-Up
4×5–8
Primary compound.

- First progress bodyweight pull-ups toward 4×8
- Then add external weight
- Once weighted, use weakest-set progression
- Prefer small load increments (+2.5–5 lb)
- Allow reps to drop after load increase

## Heavy Cable Row
3×8–12

Example:
12/10/9
→ 12/11/9
→ 12/11/10
→ 12/12/10
→ eventually 12/12/12
→ increase load

## DB Shoulder Press
3×6–10
Primary compound.

Weakest-set progression.
Example:
10/8/7 → 10/9/7 → 10/9/8 → ...
10/10/10 → increase load.

A 5-lb dumbbell jump can cause a substantial rep drop and that is acceptable.

## Heavy Lateral Raise
3×12–20
Isolation.

- Clean form is critical
- Prioritize weakest set
- Do not count swinging/cheating as progression-quality reps
- 20/20/20 → increase load
- Restart around 12–15

## Triceps Pushdown
3×10–15
Isolation.

Weakest-set progression.
15/13/11 → 15/14/11 → ...
15/15/15 → increase load.

## Curl
3×8–12
Isolation.

Weakest-set progression.
Strict reps.
12/12/12 → increase load.

---

# VOLUME UPPER

## Incline DB Press
4×8–12
Primary hypertrophy movement.

Progress toward 12/12/12/12, then increase load.
This is especially important for upper-chest development.

## Pull-Up
3×6–10
Bodyweight.

Progress toward 10/10/10.
Then consider adding weight.

## Volume Cable Row
3×10–15
Progress toward 15/15/15.
Then increase load.

## Volume Lateral Raise
3×15–20
High-rep isolation.
Clean reps > load.

## Hammer Curl
3×8–12
Standard weakest-set isolation progression.

## Close-Grip Push-Ups
Optional.
2 sets near failure.
Record performance but do not force a progression target.
Track PRs.

---

# LEGS + ABS

## Squat
3×5–8
Primary compound.

8/7/6
→ 8/8/6
→ 8/8/7
→ 8/8/8
→ increase load.

Be conservative about technique/fatigue.
Track estimated 1RM as a trend metric.

## RDL
3×8–12
Primary/hypertrophy.

Progress toward 12/12/12, then increase load.

Technique guardrail:
Do not increase load if:
- hamstring stretch is lost
- eccentric control deteriorates
- spinal position deteriorates
- ROM is reduced

## Leg Curl
3×10–15
Isolation.
Progress weakest set.
15/15/15 → increase.

## Hanging Leg Raise
3×8–15
Quality-controlled.

Prioritize:
- controlled eccentric
- no excessive swinging
- good ROM

Progress toward 15/15/15.
Eventually add resistance.

## Side Plank
2×30–60 sec/side.

Progress time:
40/35 → 45/40 → ...
60/60 → increase difficulty rather than simply holding for several minutes.

## Reverse Kegel Practice
2–3 min.

NOT progressive overload.
Track completion/quality.
Do not create a strength progression algorithm.

---

# RIR

RIR is an input/guardrail, not yet the main algorithm.

General intent:
- Most working sets around 1–3 RIR
- Failure is not required every set
- Technique remains intact
- Isolation can generally be pushed closer to failure than heavy compounds

Future V6 progression should consider RIR.

Examples:
8/8/8/8 @ 3 RIR
is not equivalent to
8/8/8/8 @ 0 RIR.

Likewise:
8/8/7/6 @ 0 RIR
vs.
8/8/7/6 @ 3 RIR
may warrant different recommendations.

Do not redesign the algorithm around RIR during V5 unless necessary for data architecture.

---

# VERSIONS

## V1
Basic local prototype:
- Workout entry
- Starting weights
- Automatic progression
- Browser storage

## V2
Exercise-specific progression:
- Weakest-set progression
- Different progression profiles
- Rear delt fly removed
- Exercise history
- Starting weights

## V3
Dashboard:
- Next workout
- Next targets
- Recent workouts
- Total workouts
- Logged volume
- PRs
- Progress charts
- Estimated 1RM trends

## V4
Workout experience:
- Mobile-first logging
- Set-by-set reps
- RIR
- Rest timer
- Workout notes
- Edit workouts
- Delete workouts
- JSON export/import
- V2/V3 localStorage migration
- Exercise-specific rest defaults

The actual V4 implementation is included in `v4/index.html`.

---

# V4 FEATURES TO PRESERVE

Dashboard:
- Next workout
- Next target for each exercise
- Recent workouts
- Workout count
- Logged volume
- PR count
- Last workout
- Training focus

Workout:
- Three current workouts
- Exercise cards
- Previous performance
- Next target
- Weight
- Reps per set
- RIR
- Rest timer
- Workout notes
- Save/edit

History:
- Workout list
- Edit
- Delete

Progress:
- Load trend
- Exercise history
- Estimated 1RM

PRs:
- Load PR
- Rep PR

Settings:
- Starting weights
- JSON export/import

---

# V5 GOAL

Move from browser-local prototype to real cloud-backed application.

Preferred stack:
- Next.js/React if appropriate
- Vercel Hobby
- Supabase Free
- Supabase Auth
- Supabase PostgreSQL
- Row Level Security

Use free tiers initially.

Architecture:

User iPhone/computer
↓
Vercel
↓
React/Next.js
↓
Supabase Auth + PostgreSQL

---

# V5 FUNCTIONAL REQUIREMENTS

## Authentication
- Sign up
- Log in
- Log out
- Persistent session

## Cloud storage
Store:
- User
- Starting weights
- Workouts
- Exercises performed
- Sets
- Reps
- Weight
- RIR
- Notes
- Dates

## Sync
Same data on phone and computer.

## User isolation
Each user can only see their own data.

Use Supabase RLS and auth.uid().

## Migration
Preserve JSON import/export.
Allow V4 JSON backup to be imported into V5.

## Backup
Keep JSON export.

---

# DATABASE DIRECTION

Possible normalized schema:

profiles
- id
- created_at

workouts
- id
- user_id
- workout_type
- performed_at
- notes
- created_at
- updated_at

workout_exercises
- id
- workout_id
- exercise_id
- weight
- unit
- rir
- notes

workout_sets
- id
- workout_exercise_id
- set_number
- reps

exercises
- id
- name
- day
- sets
- min_reps
- max_reps
- progression_type
- weight_increment
- reset_reps
- rest_seconds
- optional

Starting weights can be a separate user_exercise_settings table or equivalent.

It is acceptable to keep static program definitions in code initially if cleaner, but user performance data belongs in Supabase.

---

# SECURITY

Never put a Supabase service-role key in frontend code.

Client:
- Supabase publishable/anon key

Server/database:
- RLS
- auth.uid()

Every user-owned table must have appropriate RLS policies.

---

# V5 DEVELOPMENT APPROACH

First inspect the GitHub repository.

If empty:
- Move V4 implementation into the repo.
- Convert to an appropriate production project structure.
- Do not throw away working V4 behavior.

Then:
1. Supabase project configuration
2. Auth
3. Database schema
4. RLS
5. Cloud workout persistence
6. Cloud starting weights
7. Cloud history
8. Cloud PR/progress calculations
9. JSON import/export
10. Vercel deployment configuration
11. Documentation
12. Local/automated QA

Keep commits small and logical.

Examples:
- feat: add Supabase authentication
- feat: persist workouts in Supabase
- feat: add cloud workout history
- fix: prevent duplicate workout submissions
- fix: update progression after edited workout

---

# POST-V5 PLAN

After V5 is deployed:

## Phase 1: Manual QA
Test:
- Auth
- Workout creation
- Progression
- Editing
- Deletion
- Dashboard
- PRs
- Charts
- Cross-device sync
- Import/export
- Mobile UI

## Phase 2: Small feature improvements
Examples:
- Faster rep entry
- Auto-focus
- Better navigation
- Better exercise cards
- Improved dashboard
- Better charts
- Better rest timer
- Dark mode if wanted

## Phase 3: Progression Algorithm V6

Only after V5 is stable.

Make the progression engine more coach-like using:
- Weight
- Reps
- RIR
- Set-to-set performance
- Recent history
- Fatigue
- Exercise type
- Weight jump size
- Performance trends

The user wants maximum practical hypertrophy and strength progression, not a simplistic "add one rep" spreadsheet.

---

# QA CHECKLIST

Authentication:
- [ ] Sign up
- [ ] Login
- [ ] Logout
- [ ] Refresh
- [ ] Session persistence
- [ ] Invalid credentials

Workout:
- [ ] Heavy Upper
- [ ] Volume Upper
- [ ] Legs + Abs
- [ ] Reps
- [ ] Weight
- [ ] RIR
- [ ] Notes
- [ ] Save
- [ ] Next target

Progression:
- [ ] Baseline
- [ ] Weakest-set progression
- [ ] Top-of-range detection
- [ ] Weight increase
- [ ] Reset target
- [ ] Weighted pull-ups
- [ ] Bodyweight pull-ups
- [ ] Isolation
- [ ] Side plank
- [ ] Hanging leg raise

Editing:
- [ ] Edit
- [ ] Change reps
- [ ] Change weight
- [ ] Change RIR
- [ ] Change notes
- [ ] Save changes
- [ ] Progression recalculates appropriately

Deletion:
- [ ] Delete workout
- [ ] Dashboard updates
- [ ] History updates
- [ ] PRs update
- [ ] Progress updates

Cross-device:
- [ ] Phone → computer
- [ ] Computer → phone
- [ ] Refresh
- [ ] Re-login

Backup:
- [ ] Export
- [ ] Import
- [ ] Verify integrity

Mobile:
- [ ] Portrait
- [ ] Keyboard
- [ ] Scrolling
- [ ] Buttons
- [ ] Rest timer
- [ ] Navigation
- [ ] Fast workout entry

---

# COLLABORATION RULES

Treat the GitHub repository as the source of truth.

Do not lose existing functionality while implementing V5.

Do not redesign the progression algorithm yet.

Do not add rear delt fly.

Do not add cardio tracking unless explicitly requested.

The user's actual use case is weekly personal training, so reliability and speed matter more than flashy UI.

After V5 deployment, the user intends to run through real-world QA and request small feature improvements.

Only after that should the progression algorithm receive a major V6 improvement.

---

# IMMEDIATE REQUEST TO CLAUDE

1. Inspect `https://github.com/rmolnar10/Lifts`.
2. Inspect the attached/extracted V4 implementation in this package.
3. If the repo is empty, put the V4 app into the repo.
4. Preserve all V4 functionality.
5. Build V5 cloud architecture using Supabase Free + Vercel Hobby.
6. Add authentication and RLS.
7. Persist user data in Supabase.
8. Preserve JSON import/export.
9. Make the app deployable.
10. Test it locally.
11. Commit logical changes to GitHub.
12. Do not redesign the progression algorithm yet.
13. Once V5 is stable, stop and prepare for manual QA.

The V4 code is the starting implementation.
This document is the product/architecture context.
