# Lifts — Lift Progression Tracker

Personal workout tracker that calculates exercise-specific progressive-overload
targets. You open it, see exactly what weight and reps to hit, log what you
actually did, and it works out the next target.

**V5** moves the app off browser storage and onto Supabase + Vercel, so the same
data is on your phone and your computer. All V4 behaviour is preserved — the
progression algorithm is byte-for-byte identical and is verified against the
original V4 code by an automated parity test.

---

## Stack

| Layer     | Choice                                  |
| --------- | --------------------------------------- |
| Frontend  | Next.js 14 (App Router), React, TypeScript |
| Hosting   | Vercel (Hobby)                          |
| Auth      | Supabase Auth (email + password)        |
| Database  | Supabase PostgreSQL with Row Level Security |

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and anon key
npm run dev                    # http://localhost:3000
```

Before the app will do anything useful you need a Supabase project with the
migrations applied — see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Scripts

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Local dev server                                                  |
| `npm run build`     | Production build                                                  |
| `npm test`          | Progression, V4 parity, backup and view-render tests               |
| `npm run typecheck` | TypeScript, no emit                                                |
| `npm run lint`      | ESLint                                                            |
| `./scripts/test-db.sh` | Applies the migrations to a throwaway local Postgres and runs the RLS tests |

## Project layout

```
src/
  app/                 Next.js routes (/, /login, /auth/signout) and global styles
  components/          App shell, auth form, rest timer, and one file per view
  lib/
    program.ts         The training program: exercises, rep ranges, increments
    progression.ts     The progressive-overload engine (ported verbatim from V4)
    stats.ts           PRs, logged volume, estimated 1RM
    backup.ts          JSON backup format and legacy localStorage migration
    data.ts            All Supabase reads and writes
    supabase/          Browser / server / middleware Supabase clients
supabase/
  migrations/          Schema, RLS policies and transactional RPCs
  tests/               RLS and RPC tests
tests/                 Application test suite
v4/                    The original V4 prototype, kept as the reference implementation
docs/                  Product spec, progression rules, roadmap, QA checklist, deployment
```

## How progression works

Every required set works toward the top of its rep range. The engine finds the
weakest set and asks for one more clean rep there. Only when *every* set reaches
the top does the load go up, and the target then resets toward the bottom of the
range.

```
Bench, 4×5–8, last session 135 × 8 / 7 / 6 / 6
  → 135 × 8 / 7 / 7 / 6   "Prioritize Set 3; add one clean rep."
  → 135 × 8 / 7 / 7 / 7
  → 135 × 8 / 8 / 7 / 7
  → 135 × 8 / 8 / 8 / 7
  → 135 × 8 / 8 / 8 / 8
  → 140 lb × 5–8          "All sets reached 8. Increase load."
```

Different exercise types behave differently: bodyweight pull-ups progress on
reps, side plank progresses on time, hanging leg raise is quality-controlled,
and reverse kegel practice has no progression at all. See
[docs/PROGRESSION_RULES.md](docs/PROGRESSION_RULES.md).

RIR is recorded but is not yet an input to the algorithm — that is a V6 item.

## Security

- The browser only ever holds the Supabase **anon/publishable** key. There is no
  service-role key anywhere in this repository, and there must never be one.
- Every user-owned table has Row Level Security keyed on `auth.uid()`, so a user
  can only read and write their own rows. `scripts/test-db.sh` proves it: it
  creates two users and asserts that neither can see, edit, delete or forge the
  other's data, and that signed-out callers are locked out entirely.
- The write RPCs are `SECURITY INVOKER`, so they run under the caller's own
  permissions and RLS still applies.

## Backups

Settings → **Export backup** writes `lift-tracker-backup.json`. The format is
compatible with V4, so an old backup imports straight into the cloud, and if
this browser still holds V2/V3/V4 `localStorage` data the app offers to upload
it once.

Importing a backup **replaces everything** in that account.
