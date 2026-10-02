-- Programs as data.
--
-- Until now the training program lived in a TypeScript constant, so there could
-- only ever be one. This moves it into the database so a user can run more than
-- one program and keep their history separate per program.
--
-- Shape:
--   programs          one per training plan a user runs
--   program_blocks    a span of weeks within a program sharing one exercise set
--                     (week_end null = open-ended, which is how a plan with no
--                     week structure is represented: a single endless block)
--   program_exercises the exercises of one day inside one block
--
-- Workouts and starting weights gain a program_id so every derived number —
-- dashboard, PRs, progress, next targets — can be scoped to one program.

-- ---------------------------------------------------------------------------
-- programs
-- ---------------------------------------------------------------------------
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null,
  name text not null,
  notes text not null default '',
  -- Total weeks for a finite plan; null for one that simply repeats.
  weeks integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index if not exists programs_user_idx on public.programs (user_id);

alter table public.programs enable row level security;

drop policy if exists "programs: select own" on public.programs;
create policy "programs: select own" on public.programs for select using (auth.uid() = user_id);
drop policy if exists "programs: insert own" on public.programs;
create policy "programs: insert own" on public.programs for insert with check (auth.uid() = user_id);
drop policy if exists "programs: update own" on public.programs;
create policy "programs: update own" on public.programs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "programs: delete own" on public.programs;
create policy "programs: delete own" on public.programs for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- program_blocks
-- ---------------------------------------------------------------------------
create table if not exists public.program_blocks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  position integer not null default 0,
  name text not null,
  week_start integer not null default 1,
  week_end integer,
  constraint program_blocks_week_range check (week_end is null or week_end >= week_start)
);

create index if not exists program_blocks_program_idx on public.program_blocks (program_id, position);

alter table public.program_blocks enable row level security;

drop policy if exists "program_blocks: all own" on public.program_blocks;
create policy "program_blocks: all own" on public.program_blocks for all
  using (exists (select 1 from public.programs p where p.id = program_blocks.program_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.programs p where p.id = program_blocks.program_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- program_exercises
-- ---------------------------------------------------------------------------
create table if not exists public.program_exercises (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.program_blocks (id) on delete cascade,
  day_name text not null,
  day_position integer not null default 0,
  position integer not null default 0,
  exercise_key text not null,
  name text not null,
  sets integer not null default 3,
  min_reps integer not null default 0,
  max_reps integer not null default 0,
  -- Mirrors the engine's exercise types: primary, isolation, bodyweight,
  -- quality, timed, practice, optional.
  progression_type text not null default 'isolation',
  unit text not null default 'lb',
  increment numeric not null default 5,
  reset_reps integer not null default 0,
  rest_seconds integer not null default 90,
  -- Target effort for the final set, as RPE. 10 = 0 reps in reserve.
  target_rpe_low integer,
  target_rpe_high integer,
  dropset boolean not null default false,
  -- "A1"/"A2" pair into a superset; null means a straight set.
  superset_group text,
  per_side boolean not null default false,
  warmup_sets text,
  notes text,
  unique (block_id, day_name, exercise_key)
);

create index if not exists program_exercises_block_idx
  on public.program_exercises (block_id, day_position, position);

alter table public.program_exercises enable row level security;

drop policy if exists "program_exercises: all own" on public.program_exercises;
create policy "program_exercises: all own" on public.program_exercises for all
  using (exists (
    select 1 from public.program_blocks b
    join public.programs p on p.id = b.program_id
    where b.id = program_exercises.block_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from public.program_blocks b
    join public.programs p on p.id = b.program_id
    where b.id = program_exercises.block_id and p.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Scope existing user data to a program
-- ---------------------------------------------------------------------------
alter table public.workouts
  add column if not exists program_id uuid references public.programs (id) on delete set null,
  -- Which week of the program this session belongs to; null for programs that
  -- have no week structure.
  add column if not exists week_number integer;

create index if not exists workouts_program_idx on public.workouts (user_id, program_id, performed_at);

alter table public.user_exercise_settings
  add column if not exists program_id uuid references public.programs (id) on delete cascade;

-- The old primary key assumed one program. Starting weights are now per
-- program, so the same exercise can have a different baseline in each.
alter table public.user_exercise_settings
  drop constraint if exists user_exercise_settings_pkey;
alter table public.user_exercise_settings
  add column if not exists id uuid primary key default gen_random_uuid();

create unique index if not exists user_exercise_settings_unique
  on public.user_exercise_settings (user_id, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid), day, exercise_id);

-- Which program the user is currently running.
alter table public.profiles
  add column if not exists active_program_id uuid references public.programs (id) on delete set null;
