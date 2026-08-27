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
npm test        # 58 unit tests: progression, V4 parity, backup, drafts, view rendering
npm run qa      # 30 end-to-end checks in a real browser, mobile + desktop
npm run test:db # 13 checks: migrations, RLS isolation, cascades, anon lockout
npm run typecheck && npm run lint && npm run build
```

`npm run qa` stands up a throwaway Postgres with the real migrations, a Supabase
stub in front of it, and the app, then drives Chromium through the checklist.
See `.claude/skills/qa/SKILL.md`.

All green as of the last commit.

## Deployment shape

- **Repo:** `rmolnar10/Lifts` (public)
- **Branch:** `main` only. It is GitHub's default branch and Vercel's production
  branch; every push to it deploys to production. Work directly on `main`.
- **Vercel:** project imported from GitHub, auto-deploys on push. Env vars
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set on
  Production and Preview.
- **Supabase:** project provisioned, both migrations in `supabase/migrations`
  applied, RLS verified.

> `NEXT_PUBLIC_*` values are compiled into the build, not read at runtime.
> Changing one requires a **redeploy**, not a restart. This has already caused
> one round of confusion — see *Outstanding* for the hardening fix.

## Outstanding

1. **Delete the stale `claude/lifts-v5-supabase-vercel-3iwa63` remote branch.**
   It holds nothing `main` does not. The session's GitHub proxy only allows
   pushes to the current working branch, so `git push --delete` is refused and a
   session cannot remove it — do it from the repo's Branches page on GitHub.
   Until then it produces a duplicate preview build on every push.
2. **Runtime config hardening.** Read Supabase config server-side at request
   time and pass it to the client, so a wrong env var can't produce the
   "Supabase is not configured" card without a rebuild.
3. **Remaining QA checklist.** `docs/QA_CHECKLIST.md` — cross-device sync and
   the mobile passes are the parts automation won't fully cover.

## Session capabilities

This matters for planning what Claude can do unaided.

**Connectors installed:** the official **Supabase** and **Vercel** MCP
connectors are connected. Connector traffic routes through Anthropic's servers
rather than the session's network, so they work regardless of the egress policy.
Supabase exposes `execute_sql`, `apply_migration`, `list_tables`, `get_advisors`;
Vercel exposes deployments, build logs and runtime errors.

**Network access** is set to Custom with `*.vercel.app` and `*.supabase.co`
allowed, so the live site is reachable from a session. `api.vercel.com` and
`api.supabase.com` remain blocked — the connectors cover those.

**Preinstalled:** Node 22, PostgreSQL 16, Chromium + Playwright. Docker is *not*
available.

**Live URLs:** `lifts-ten.vercel.app` is public. `lifts-rmolnar11.vercel.app`
and `lifts-git-main-rmolnar11.vercel.app` sit behind Vercel SSO
(`ssoProtection: all_except_custom_domains`).

## Ground rules

- Don't redesign the progression algorithm. That is V6, and only after QA.
- Don't add rear delt fly. Don't add cardio tracking unless asked.
- V4 behaviour is the baseline; `tests/v4-parity.test.ts` enforces it.
- Never put a Supabase `service_role` key in this repo or in Vercel.
