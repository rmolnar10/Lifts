# Deploying Lifts V5

Supabase Free + Vercel Hobby. Roughly 15 minutes end to end.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Pick a name (`lifts`), a strong database password, and the region closest to
   you. The Free plan is enough.
3. Wait for provisioning to finish.

## 2. Apply the database migrations

In the Supabase dashboard, open **SQL Editor** and run these two files **in
order**, pasting the contents of each and pressing *Run*:

1. `supabase/migrations/0001_init.sql` — tables, indexes, RLS policies, and the
   trigger that creates a profile row on sign-up.
2. `supabase/migrations/0002_rpc.sql` — the transactional save/import/reset
   functions.

Both files are safe to re-run.

> Using the Supabase CLI instead? `supabase link --project-ref <ref>` then
> `supabase db push` applies the same files.

### Verify

In **Table Editor** you should see `profiles`, `user_exercise_settings`,
`workouts`, `workout_exercises` and `workout_sets`, each showing **RLS enabled**.
If any table shows RLS disabled, stop and re-run `0001_init.sql` — without it
your data would be readable by anyone with the anon key.

## 3. Configure authentication

Under **Authentication → Providers**, keep **Email** enabled.

- Leave *Confirm email* **on** for normal use. Sign-up then sends a confirmation
  link, and the app tells you to check your inbox before signing in.
- Turning it **off** lets you sign in immediately, which is convenient while you
  are the only user.

Under **Authentication → URL Configuration**, set the **Site URL** to your
Vercel domain once you have it (step 5).

## 4. Collect the keys

**Project Settings → API**:

| Value                     | Environment variable              |
| ------------------------- | --------------------------------- |
| Project URL               | `NEXT_PUBLIC_SUPABASE_URL`        |
| `anon` / publishable key  | `NEXT_PUBLIC_SUPABASE_ANON_KEY`   |

**Never** copy the `service_role` key into this project, into Vercel, or into
any file here. It bypasses Row Level Security.

## 5. Deploy to Vercel

1. Push this repository to GitHub.
2. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
   Next.js is detected automatically; no build settings to change.
3. Add both environment variables from step 4 to **Production**, **Preview**
   and **Development**.
4. **Deploy**.

> `NEXT_PUBLIC_*` variables are baked in at build time. If you add or change
> them later, **redeploy** — restarting is not enough.

5. Copy the deployment URL back into Supabase → **Authentication → URL
   Configuration → Site URL**, so confirmation emails link to the right place.

## 6. First run

1. Open the deployment and **Create an account**.
2. Go to **Settings** and enter your starting weights.
3. If you used V4 in this browser, a banner offers to import that local data
   into your account — or use **Settings → Import backup** with an exported
   `lift-tracker-backup.json`.
4. Log a workout, then open the app on your phone and sign in with the same
   account. The workout should be there.

## Running locally

```bash
npm install
cp .env.example .env.local     # fill in the two values from step 4
npm run dev
```

The same Supabase project backs local and production, so local testing writes
real data to your account. Export a backup first if that matters.

## Testing before you deploy

```bash
npm run typecheck
npm run lint
npm test                # progression, V4 parity, backup, view rendering
npm run build
./scripts/test-db.sh    # RLS + RPC tests against a throwaway local Postgres
```

`scripts/test-db.sh` needs a local PostgreSQL 14+ install. It never touches your
Supabase project.

## Applying later migrations

Migrations are **not** applied automatically by a deploy. Paste each new file in
`supabase/migrations/` into the Supabase SQL editor, in filename order.

The app tolerates a deploy landing ahead of its migration: if the programs
schema is missing it falls back to the built-in program rather than failing, so
there is no rush and no particular order between deploying and migrating.

The Supabase MCP connector cannot apply migrations containing `DROP` or
`DELETE`; use the SQL editor for those.

## Troubleshooting

**"Supabase is not configured"** — the environment variables are missing from
the build. Add them in Vercel and redeploy.

**Signed in but no data, or a permissions error** — the migrations were not
applied, or were applied only partially. Re-run both SQL files.

**Sign-up appears to do nothing** — email confirmation is on and the message is
waiting in your inbox. Check spam, or disable *Confirm email* in Supabase.

**Redirected to /login in a loop** — the Site URL in Supabase does not match the
deployment domain.
