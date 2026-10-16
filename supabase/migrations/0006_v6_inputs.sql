-- V6 inputs: the three one-tap signals the progression engine reads.
--
--   workouts.readiness         how the lifter felt at the start: rough / normal / good
--   workout_exercises.form_ok  did form hold on every rep (true) or break down (false)
--   body_metrics               bodyweight, logged about once a week
--
-- All three are optional. A null means "not recorded", and the engine falls back
-- to V5 behaviour for that signal.
--
-- Requires 0004_program_rpcs.sql: it redefines the program-aware save_workout
-- and import_backup. Applying it on top of the pre-programs functions would
-- leave two save_workout overloads that PostgREST cannot choose between.

do $$
begin
  if to_regprocedure('public.save_workout(uuid,text,timestamptz,text,jsonb,uuid,integer)') is null then
    raise exception 'Apply 0004_program_rpcs.sql and 0005_scoped_reset.sql before this migration';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- readiness + form
-- ---------------------------------------------------------------------------
alter table public.workouts
  add column if not exists readiness text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workouts_readiness_check') then
    alter table public.workouts
      add constraint workouts_readiness_check
      check (readiness is null or readiness in ('rough', 'normal', 'good'));
  end if;
end $$;

alter table public.workout_exercises
  add column if not exists form_ok boolean;

-- ---------------------------------------------------------------------------
-- body_metrics: one bodyweight per user per day
-- ---------------------------------------------------------------------------
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  measured_on date not null,
  weight numeric not null check (weight > 0),
  unit text not null default 'lb',
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

alter table public.body_metrics enable row level security;

drop policy if exists "body_metrics: select own" on public.body_metrics;
create policy "body_metrics: select own" on public.body_metrics for select using (auth.uid() = user_id);
drop policy if exists "body_metrics: insert own" on public.body_metrics;
create policy "body_metrics: insert own" on public.body_metrics for insert with check (auth.uid() = user_id);
drop policy if exists "body_metrics: update own" on public.body_metrics;
create policy "body_metrics: update own" on public.body_metrics for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "body_metrics: delete own" on public.body_metrics;
create policy "body_metrics: delete own" on public.body_metrics for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- log_bodyweight: record (or correct) one day's bodyweight. A null weight
-- removes that day's entry.
-- ---------------------------------------------------------------------------
create or replace function public.log_bodyweight(
  p_measured_on date,
  p_weight numeric,
  p_unit text default 'lb'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_measured_on is null then
    raise exception 'A date is required';
  end if;

  if p_weight is null then
    delete from public.body_metrics
     where user_id = auth.uid() and measured_on = p_measured_on;
    return;
  end if;

  insert into public.body_metrics (user_id, measured_on, weight, unit)
  values (auth.uid(), p_measured_on, p_weight, coalesce(p_unit, 'lb'))
  on conflict (user_id, measured_on)
  do update set weight = excluded.weight, unit = excluded.unit;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_workout_readiness: kept separate from save_workout so its signature, and
-- every caller of it, stays exactly as 0004 left it.
-- ---------------------------------------------------------------------------
create or replace function public.set_workout_readiness(
  p_workout_id uuid,
  p_readiness text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.workouts
     set readiness = p_readiness
   where id = p_workout_id and user_id = auth.uid();
  if not found then
    raise exception 'Workout % was not found', p_workout_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_workout: unchanged signature; now also stores each exercise's form_ok.
-- ---------------------------------------------------------------------------
create or replace function public.save_workout(
  p_workout_id uuid,
  p_day text,
  p_performed_at timestamptz,
  p_notes text,
  p_exercises jsonb,
  p_program_id uuid default null,
  p_week_number integer default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workout_id uuid;
  v_exercise jsonb;
  v_exercise_row_id uuid;
  v_rep jsonb;
  v_set_number integer;
  v_position integer := 0;
begin
  if p_day is null or p_day = '' then
    raise exception 'A workout day is required';
  end if;

  if p_workout_id is null then
    insert into public.workouts (user_id, day, performed_at, notes, program_id, week_number)
    values (auth.uid(), p_day, coalesce(p_performed_at, now()), coalesce(p_notes, ''),
            p_program_id, p_week_number)
    returning id into v_workout_id;
  else
    update public.workouts
       set day = p_day,
           performed_at = coalesce(p_performed_at, performed_at),
           notes = coalesce(p_notes, ''),
           program_id = coalesce(p_program_id, program_id),
           week_number = coalesce(p_week_number, week_number),
           updated_at = now()
     where id = p_workout_id
    returning id into v_workout_id;

    if v_workout_id is null then
      raise exception 'Workout % was not found', p_workout_id;
    end if;

    delete from public.workout_exercises where workout_id = v_workout_id;
  end if;

  for v_exercise in
    select value from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb))
  loop
    insert into public.workout_exercises
      (workout_id, exercise_id, name, weight, unit, rir, form_ok, position)
    values (
      v_workout_id,
      v_exercise ->> 'exercise_id',
      coalesce(v_exercise ->> 'name', v_exercise ->> 'exercise_id'),
      coalesce((v_exercise ->> 'weight')::numeric, 0),
      coalesce(v_exercise ->> 'unit', 'lb'),
      (v_exercise ->> 'rir')::smallint,
      (v_exercise ->> 'form_ok')::boolean,
      v_position
    )
    returning id into v_exercise_row_id;

    v_set_number := 0;
    for v_rep in
      select value from jsonb_array_elements(coalesce(v_exercise -> 'reps', '[]'::jsonb))
    loop
      v_set_number := v_set_number + 1;
      insert into public.workout_sets (workout_exercise_id, set_number, reps)
      values (v_exercise_row_id, v_set_number, coalesce((v_rep #>> '{}')::numeric, 0));
    end loop;

    v_position := v_position + 1;
  end loop;

  return v_workout_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_backup: unchanged signature; now restores each workout's readiness.
-- ---------------------------------------------------------------------------
create or replace function public.import_backup(
  p_starts jsonb,
  p_workouts jsonb,
  p_program_id uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workout jsonb;
  v_workout_id uuid;
  v_count integer := 0;
begin
  delete from public.workouts
   where user_id = auth.uid() and program_id is not distinct from p_program_id;
  delete from public.user_exercise_settings
   where user_id = auth.uid() and program_id is not distinct from p_program_id;

  perform public.save_starting_weights(p_starts, p_program_id);

  for v_workout in
    select value from jsonb_array_elements(coalesce(p_workouts, '[]'::jsonb))
  loop
    v_workout_id := public.save_workout(
      null,
      v_workout ->> 'day',
      (v_workout ->> 'performed_at')::timestamptz,
      coalesce(v_workout ->> 'notes', ''),
      coalesce(v_workout -> 'exercises', '[]'::jsonb),
      p_program_id,
      (v_workout ->> 'week_number')::integer
    );
    if (v_workout ->> 'readiness') is not null then
      update public.workouts set readiness = v_workout ->> 'readiness' where id = v_workout_id;
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.log_bodyweight(date, numeric, text) from public, anon;
revoke all on function public.set_workout_readiness(uuid, text) from public, anon;
grant execute on function public.log_bodyweight(date, numeric, text) to authenticated;
grant execute on function public.set_workout_readiness(uuid, text) to authenticated;
