# V5 implementation notes

What changed moving from the V4 browser prototype to the cloud app, what was
deliberately left alone, and what is worth looking at after QA.

---

## What was preserved exactly

The progression engine is a line-by-line port of V4's `suggest()`. Nothing about
it was redesigned — that is a V6 item.

`tests/v4-parity.test.ts` proves it: it loads `v4/index.html`, evaluates the
original `PROGRAM`, `prev()`, `suggest()` and `calcPRs()` in a VM sandbox, and
compares them against the TypeScript port across ~2,000 generated scenarios
covering every exercise, every progression type, empty histories, partial
histories and missing starting weights. Target text, coaching focus text and the
prefilled weight must all match exactly. Logged volume and PR output are
compared the same way.

If a future change alters progression behaviour, that test fails.

Also preserved: the V4 stylesheet (so the phone experience is unchanged), the
three programmed days and their exercises, the exercise-specific rest defaults,
the JSON backup format, and the absence of rear delt fly and cardio tracking.

## Architecture

```
phone / computer
      │
      ▼
   Vercel  ──  Next.js App Router (React, TypeScript)
      │
      ▼
  Supabase  ──  Auth (email + password)
             └  PostgreSQL + Row Level Security
```

**Program data stays in code** (`src/lib/program.ts`). It is identical for every
user, and keeping it out of the database means changing a rep range is a code
change rather than a migration. Only performance data — workouts, sets, RIR,
notes, starting weights — lives in Supabase.

**Reads** go straight to PostgREST with the anon key. There is no client-side
`user_id` filter anywhere, because RLS does the filtering; a forgotten filter
therefore cannot leak data.

**Writes** go through `SECURITY INVOKER` RPCs. A workout spans three tables
(`workouts`, `workout_exercises`, `workout_sets`), so doing it as three separate
calls could leave a half-saved workout behind if one failed. `save_workout` does
all of it in one transaction. Because the functions are invoker-rights, RLS
still applies inside them — they are a transaction boundary, not a privilege
escalation.

**Editing a workout** replaces its exercises and sets wholesale rather than
diffing them. Cascade deletes clean up the old rows, so no orphans accumulate.

## Deliberate changes

| Change | Why |
| --- | --- |
| "Reset data" moved from the header to Settings | The header now carries the account email and sign-out; a destructive button next to sign-out on a phone is a mis-tap waiting to happen. |
| Workouts sort by `performed_at` | V4 relied on array insertion order. Sorting by the recorded time is equivalent in normal use and stays correct if a date is ever edited. |
| Save button disables while saving | On a phone, a double tap on "Finish & save workout" would otherwise create two workouts. |
| App re-syncs when the tab regains focus | Cross-device sync is the point of V5; without this you would have to reload after logging on your phone. |
| Errors surface in the UI | V4 could not fail — everything was local. Network and permission failures now have to be visible rather than silent. |

## Known behaviour worth revisiting after QA

These are V4 behaviours that were kept as-is rather than "fixed", because V5 is a
platform migration and changing them mid-migration would muddy the parity test.
They are on the post-V5 list in `ROADMAP.md`.

1. **Weight field prefills last session's load, not the suggested one.** After
   8/8/8/8 the target line correctly reads "140 lb × 5–8", but the weight input
   still shows 135 and has to be changed by hand. This is exactly what V4 did.

2. **Rep PRs are always labelled "reps".** Side plank therefore reads "60 reps"
   rather than "60 sec". Cosmetic, and again V4's behaviour.

3. **The spec's bench example jumps two reps at once** (`8/7/6/6 → 8/8/7/7`)
   while V4 adds a single rep to the single weakest set (`8/7/6/6 → 8/7/7/6`).
   The implemented behaviour matches the spec's stated rule — "prioritize adding
   a clean rep to the weakest set" — and matches V4. The worked example in
   `PROJECT_SPEC.md` is the thing that is out of step. Worth deciding
   deliberately in V6 rather than drifting into one or the other.

4. **Workout dates are not editable.** A workout is stamped when saved, as in
   V4. Logging a session the next morning records the wrong day.

## Testing

| Command | Covers |
| --- | --- |
| `npm test` | 40 tests: progression rules, V4 parity, backup round-trip, every view rendering with and without data |
| `./scripts/test-db.sh` | 13 checks: migrations apply and re-apply cleanly, RLS isolates two users, cascade deletes, backup import, anon lockout |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | Types and lint |

The database tests spin up a throwaway local Postgres with a minimal `auth`
schema stub. They never touch the real Supabase project.

What the automated tests do **not** cover, and manual QA must: real Supabase
auth flows (confirmation email, invalid credentials, session persistence across
restarts), true cross-device sync, and the mobile keyboard/scroll experience.
`docs/QA_CHECKLIST.md` is the list.
