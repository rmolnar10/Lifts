-- Lifts V5 — initial cloud schema.
--
-- Design notes:
--  * Program definitions (exercises, rep ranges, increments) stay in application code.
--    Only user-owned performance data lives here.
--  * Every user-owned table has Row Level Security enabled with auth.uid() policies,
--    so the browser can talk to PostgREST directly with the anon/publishable key.
--  * Child tables (workout_exercises, workout_sets) are protected through their parent
--    workout, which is where user_id lives.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Create a profile row automatically for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- starting weights
-- ---------------------------------------------------------------------------
create table if not exists public.user_exercise_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day text not null,
  exercise_id text not null,
  starting_weight numeric,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, exercise_id)
);

alter table public.user_exercise_settings enable row level security;

drop policy if exists "settings: select own" on public.user_exercise_settings;
create policy "settings: select own"
  on public.user_exercise_settings for select
  using (auth.uid() = user_id);

drop policy if exists "settings: insert own" on public.user_exercise_settings;
create policy "settings: insert own"
  on public.user_exercise_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "settings: update own" on public.user_exercise_settings;
create policy "settings: update own"
  on public.user_exercise_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "settings: delete own" on public.user_exercise_settings;
create policy "settings: delete own"
  on public.user_exercise_settings for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- workouts
-- ---------------------------------------------------------------------------
create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day text not null,
  performed_at timestamptz not null default now(),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workouts_user_performed_idx
  on public.workouts (user_id, performed_at, created_at);

alter table public.workouts enable row level security;

drop policy if exists "workouts: select own" on public.workouts;
create policy "workouts: select own"
  on public.workouts for select
  using (auth.uid() = user_id);

drop policy if exists "workouts: insert own" on public.workouts;
create policy "workouts: insert own"
  on public.workouts for insert
  with check (auth.uid() = user_id);

drop policy if exists "workouts: update own" on public.workouts;
create policy "workouts: update own"
  on public.workouts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "workouts: delete own" on public.workouts;
create policy "workouts: delete own"
  on public.workouts for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- workout_exercises
-- ---------------------------------------------------------------------------
create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id text not null,
  name text not null,
  weight numeric not null default 0,
  unit text not null default 'lb',
  rir smallint,
  notes text,
  position integer not null default 0,
  unique (workout_id, exercise_id)
);

create index if not exists workout_exercises_workout_idx
  on public.workout_exercises (workout_id);

alter table public.workout_exercises enable row level security;

drop policy if exists "workout_exercises: select own" on public.workout_exercises;
create policy "workout_exercises: select own"
  on public.workout_exercises for select
  using (exists (
    select 1 from public.workouts w
    where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
  ));

drop policy if exists "workout_exercises: insert own" on public.workout_exercises;
create policy "workout_exercises: insert own"
  on public.workout_exercises for insert
  with check (exists (
    select 1 from public.workouts w
    where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
  ));

drop policy if exists "workout_exercises: update own" on public.workout_exercises;
create policy "workout_exercises: update own"
  on public.workout_exercises for update
  using (exists (
    select 1 from public.workouts w
    where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workouts w
    where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
  ));

drop policy if exists "workout_exercises: delete own" on public.workout_exercises;
create policy "workout_exercises: delete own"
  on public.workout_exercises for delete
  using (exists (
    select 1 from public.workouts w
    where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- workout_sets
-- ---------------------------------------------------------------------------
create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number integer not null,
  reps numeric not null default 0,
  unique (workout_exercise_id, set_number)
);

create index if not exists workout_sets_exercise_idx
  on public.workout_sets (workout_exercise_id);

alter table public.workout_sets enable row level security;

drop policy if exists "workout_sets: select own" on public.workout_sets;
create policy "workout_sets: select own"
  on public.workout_sets for select
  using (exists (
    select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
     where we.id = workout_sets.workout_exercise_id and w.user_id = auth.uid()
  ));

drop policy if exists "workout_sets: insert own" on public.workout_sets;
create policy "workout_sets: insert own"
  on public.workout_sets for insert
  with check (exists (
    select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
     where we.id = workout_sets.workout_exercise_id and w.user_id = auth.uid()
  ));

drop policy if exists "workout_sets: update own" on public.workout_sets;
create policy "workout_sets: update own"
  on public.workout_sets for update
  using (exists (
    select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
     where we.id = workout_sets.workout_exercise_id and w.user_id = auth.uid()
  ))
  with check (exists (
    select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
     where we.id = workout_sets.workout_exercise_id and w.user_id = auth.uid()
  ));

drop policy if exists "workout_sets: delete own" on public.workout_sets;
create policy "workout_sets: delete own"
  on public.workout_sets for delete
  using (exists (
    select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
     where we.id = workout_sets.workout_exercise_id and w.user_id = auth.uid()
  ));
