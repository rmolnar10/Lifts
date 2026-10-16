# Lifts Progression Rules

The app uses exercise-specific progressive overload.

## Core algorithm

For normal rep-range exercises:
1. Record every set.
2. Identify the weakest required set.
3. If every required set reaches the maximum rep target, increase load.
4. Otherwise, prioritize adding one clean rep to the weakest set.
5. After increasing load, reset the suggested target toward the bottom of the range.
6. Do not require an exact rep pattern after a load increase.

## Primary compounds
- Bench: 4x5-8
- Weighted pull-up: 4x5-8
- DB shoulder press: 3x6-10
- Incline DB press: 5x6-10
- Squat: 3x5-8
- RDL: 3x8-12

Use weakest-set progression. Load increases only after all sets reach the top.

## Isolation
- Heavy cable row: 3x8-12
- Heavy lateral raise: 3x12-20
- Triceps pushdown: 3x10-15
- Overhead triceps extension: 3x10-15
- Curl: 3x8-12
- Volume cable row: 3x10-15
- Volume lateral raise: 3x15-20
- Hammer curl: 3x8-12
- Leg curl: 3x10-15

Use weakest-set progression and controlled reps.

## Bodyweight
Pull-ups progress toward the top of the range before adding external load. Once
every set reaches 10, the app switches to prescribing external load in 2.5 lb
steps; until then it shows "Bodyweight" rather than a load of zero.

## Quality-controlled
Hanging leg raise prioritizes clean, controlled reps.

## Timed
Side plank progresses time toward 60 seconds before increasing difficulty.

## Practice
Reverse Kegel practice is completion/quality, not progressive overload.

## Optional
No exercise currently uses this type. Close-grip push-ups did, and were replaced
by the overhead triceps extension because an unprogressed optional slot left
direct triceps volume at 3 sets/week against 6 for biceps. The engine still
supports the type if a future program needs it.

## V6 engine (`src/lib/engine.ts`)

The rules above are still the base (`progression.ts`, pinned to V4 by the
parity suite). V6 wraps them for the load-progressed types (primary, isolation,
bodyweight) and reads four extra signals: readiness at the start of the
session, whether form held, RIR on the final set, and weekly bodyweight.

Tuned to the lifter in `src/lib/athlete.ts`: **late novice** (about 6 months
lifting) and **eating in a deficit**. Change that file when either changes.

The cascade, first match wins:

1. **Rough day today** — repeat last session's load and reps, no increases,
   stop sets at 2–3 RIR, skip any added sets. A rough session never counts
   against a lift: it is ignored when judging stalls and progress streaks.
2. **Form broke down last session** — hold the load and repeat the numbers
   cleanly. Twice running at the same load: drop one increment.
3. **Every set at the top of the range** — add load, back to the program's set
   count. Two increments when the final set had 3+ RIR (late novice), one
   otherwise. Unrecorded form counts as held, so pre-V6 history works as before.
4. **Stalled** — 4 sessions at one load with no rep gained (late novice; an
   intermediate would be 3). In a **deficit** the load holds, any added set is
   dropped, and bodyweight is read to say whether the cut is too fast. In a
   surplus or at maintenance, back off about 10% and rebuild.
5. **Set-count progression** — after 3 sessions of progress in a row at one
   load (2 in a surplus), with form holding and the last set not at 0 RIR, add
   a set. Cap: one extra set in a deficit (two for accessories in a surplus).
   The set count resets when load goes up.
6. **Building** — one clean rep on the weakest set; a rep on every short set
   when the final set had 3+ RIR.

The lifter can always add or remove a set on the workout screen; the engine
reads whatever was logged.
