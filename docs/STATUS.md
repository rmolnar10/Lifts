# Project status

Living handoff note. Update it when the deployment or the plan changes — a new
Claude session reads this first to know where things stand.

_Last updated: 2026-08-27_

---

## Where things stand

**V5 is built, deployed and in real use.** The app is live on Vercel, backed by
Supabase, and the first workouts have been logged through it.

| Piece | State |
| --- | --- |
| Schema + RLS | Applied to the live Supabase project. 5 tables, 19 policies, 4 RPCs, all verified |
| Auth | Email + password, working end to end |
| Deployment | Live on Vercel, auto-deploys on push |
| V4 feature parity | Complete, guarded by an automated parity test |
| Real-world QA | Started. One bug found and fixed (see below) |

## Verification

```bash
npm test              # 58 tests: progression, V4 parity, backup, drafts, view rendering
npm run typecheck
npm run lint
npm run build
./scripts/test-db.sh  # 13 checks: migrations, RLS isolation, cascades, anon lockout
```

All green as of the last commit.

## Deployment shape

- **Repo:** `rmolnar10/Lifts` (public)
- **Branches:** `main` and `claude/lifts-v5-supabase-vercel-3iwa63` are kept at the
  same commit. See *Outstanding* — this is a workaround, not the intended end state.
- **Vercel:** project imported from GitHub, auto-deploys on push. Env vars
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set on
  Production and Preview.
- **Supabase:** project provisioned, both migrations in `supabase/migrations`
  applied, RLS verified.

> `NEXT_PUBLIC_*` values are compiled into the build, not read at runtime.
> Changing one requires a **redeploy**, not a restart. This has already caused
> one round of confusion — see *Outstanding* for the hardening fix.

## Outstanding

1. **Branch cleanup.** GitHub's default branch and Vercel's Production Branch
   both still point at `claude/lifts-v5-supabase-vercel-3iwa63`. Once both are
   switched to `main`, a push to `main` triggers the first real production
   deploy, and the duplicate branch can go.
2. **QA skill.** Build `.claude/skills/qa/SKILL.md` driving Playwright
   (Chromium is preinstalled at `/opt/pw-browsers`) through
   `docs/QA_CHECKLIST.md`. Tier 1 runs against the app locally with a stubbed
   Supabase over the real local Postgres; Tier 2 runs against the live site and
   needs `*.vercel.app` in the environment's allowed domains.
3. **Runtime config hardening.** Read Supabase config server-side at request
   time and pass it to the client, so a wrong env var can't produce the
   "Supabase is not configured" card without a rebuild.
4. **Remaining QA checklist.** `docs/QA_CHECKLIST.md` — cross-device sync and
   the mobile passes are the parts automation won't fully cover.

## Session capabilities

This matters for planning what Claude can do unaided.

**Blocked by the cloud environment's default network policy** (403 at the egress
proxy): `api.vercel.com`, `api.supabase.com`, `*.vercel.app`. Claude cannot
deploy, run migrations remotely, or load the live site unless the environment's
network access is set to **Custom** with those hosts allowed.

**Not blocked:** GitHub, npm, `raw.githubusercontent.com`. Claude can commit and
push, which is what drives deploys.

**MCP connectors bypass the network policy entirely** — connector traffic goes
through Anthropic's servers, not the session's network. Installing the official
**Supabase** and **Vercel** connectors gives Claude project and deployment
access without any network change.

**Preinstalled and usable now:** Node 22, PostgreSQL 16 (used by
`scripts/test-db.sh`), Chromium + Playwright. Docker is *not* available.

## Ground rules

- Don't redesign the progression algorithm. That is V6, and only after QA.
- Don't add rear delt fly. Don't add cardio tracking unless asked.
- V4 behaviour is the baseline; `tests/v4-parity.test.ts` enforces it.
- Never put a Supabase `service_role` key in this repo or in Vercel.
