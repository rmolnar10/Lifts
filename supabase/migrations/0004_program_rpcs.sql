-- Program RPCs: import a program from JSON, and adopt existing history into one.
--
-- SECURITY INVOKER throughout, so Row Level Security still decides what a
-- caller can touch. These only exist to keep multi-table writes atomic.

-- The pre-program signatures are replaced rather than overloaded: keeping both
-- would make a call with the old argument count ambiguous.
drop function if exists public.save_workout(uuid, text, timestamptz, text, jsonb);
drop function if exists public.save_starting_weights(jsonb);
drop function if exists public.import_backup(jsonb, jsonb);

-- ---------------------------------------------------------------------------
-- import_program: create or replace a whole program from a JSON document.
--
-- p_program shape:
--   { "slug": "...", "name": "...", "notes": "...", "weeks": 12,
--     "blocks": [ { "name": "...", "week_start": 1, "week_end": 4,
--                   "days": [ { "name": "Upper", "position": 0,
--                               "exercises": [ { ...one row per exercise... } ] } ] } ] }
--
-- Re-importing the same slug replaces its blocks and exercises but keeps the
-- program row, so logged workouts keep pointing at it.
-- ---------------------------------------------------------------------------
create or replace function public.import_program(p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_block jsonb;
  v_block_id uuid;
  v_day jsonb;
  v_ex jsonb;
  v_block_pos integer := 0;
begin
  if coalesce(p_program ->> 'slug', '') = '' then
    raise exception 'A program slug is required';
  end if;

  insert into public.programs (user_id, slug, name, notes, weeks)
  values (
    auth.uid(),
    p_program ->> 'slug',
    coalesce(p_program ->> 'name', p_program ->> 'slug'),
    coalesce(p_program ->> 'notes', ''),
    (p_program ->> 'weeks')::integer
  )
  on conflict (user_id, slug) do update
    set name = excluded.name,
        notes = excluded.notes,
        weeks = excluded.weeks,
        updated_at = now()
  returning id into v_program_id;

  -- Replace the structure wholesale; cascades clear the exercises.
  delete from public.program_blocks where program_id = v_program_id;

  for v_block in select value from jsonb_array_elements(coalesce(p_program -> 'blocks', '[]'::jsonb))
  loop
    insert into public.program_blocks (program_id, position, name, week_start, week_end)
    values (
      v_program_id,
      v_block_pos,
      coalesce(v_block ->> 'name', 'Block'),
      coalesce((v_block ->> 'week_start')::integer, 1),
      (v_block ->> 'week_end')::integer
    )
    returning id into v_block_id;

    for v_day in select value from jsonb_array_elements(coalesce(v_block -> 'days', '[]'::jsonb))
    loop
      for v_ex in select value from jsonb_array_elements(coalesce(v_day -> 'exercises', '[]'::jsonb))
      loop
        insert into public.program_exercises (
          block_id, day_name, day_position, position, exercise_key, name,
          sets, min_reps, max_reps, progression_type, unit, increment, reset_reps,
          rest_seconds, target_rpe_low, target_rpe_high, dropset, superset_group,
          per_side, warmup_sets, notes
        ) values (
          v_block_id,
          v_day ->> 'name',
          coalesce((v_day ->> 'position')::integer, 0),
          coalesce((v_ex ->> 'position')::integer, 0),
          v_ex ->> 'key',
          v_ex ->> 'name',
          coalesce((v_ex ->> 'sets')::integer, 3),
          coalesce((v_ex ->> 'min_reps')::integer, 0),
          coalesce((v_ex ->> 'max_reps')::integer, 0),
          coalesce(v_ex ->> 'progression_type', 'isolation'),
          coalesce(v_ex ->> 'unit', 'lb'),
          coalesce((v_ex ->> 'increment')::numeric, 5),
          coalesce((v_ex ->> 'reset_reps')::integer, coalesce((v_ex ->> 'min_reps')::integer, 0)),
          coalesce((v_ex ->> 'rest_seconds')::integer, 90),
          (v_ex ->> 'target_rpe_low')::integer,
          (v_ex ->> 'target_rpe_high')::integer,
          coalesce((v_ex ->> 'dropset')::boolean, false),
          v_ex ->> 'superset_group',
          coalesce((v_ex ->> 'per_side')::boolean, false),
          v_ex ->> 'warmup_sets',
          v_ex ->> 'notes'
        );
      end loop;
    end loop;

    v_block_pos := v_block_pos + 1;
  end loop;

  return v_program_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- adopt_orphan_history: attach workouts and starting weights that predate
-- programs to one program.
--
-- Only touches rows whose program_id is still null, so it is safe to re-run and
-- can never move history off a program it has already been assigned to.
-- ---------------------------------------------------------------------------
create or replace function public.adopt_orphan_history(p_program_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workouts integer;
begin
  if not exists (
    select 1 from public.programs where id = p_program_id and user_id = auth.uid()
  ) then
    raise exception 'Program % was not found', p_program_id;
  end if;

  update public.workouts
     set program_id = p_program_id
   where user_id = auth.uid() and program_id is null;
  get diagnostics v_workouts = row_count;

  update public.user_exercise_settings
     set program_id = p_program_id
   where user_id = auth.uid() and program_id is null;

  return v_workouts;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_active_program
-- ---------------------------------------------------------------------------
create or replace function public.set_active_program(p_program_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_program_id is not null and not exists (
    select 1 from public.programs where id = p_program_id and user_id = auth.uid()
  ) then
    raise exception 'Program % was not found', p_program_id;
  end if;

  update public.profiles set active_program_id = p_program_id where id = auth.uid();
end;
$$;

-- save_workout gains the program it belongs to, and the week within it.
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
      (workout_id, exercise_id, name, weight, unit, rir, position)
    values (
      v_workout_id,
      v_exercise ->> 'exercise_id',
      coalesce(v_exercise ->> 'name', v_exercise ->> 'exercise_id'),
      coalesce((v_exercise ->> 'weight')::numeric, 0),
      coalesce(v_exercise ->> 'unit', 'lb'),
      (v_exercise ->> 'rir')::smallint,
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

-- save_starting_weights becomes program-aware.
create or replace function public.save_starting_weights(
  p_starts jsonb,
  p_program_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start jsonb;
begin
  for v_start in
    select value from jsonb_array_elements(coalesce(p_starts, '[]'::jsonb))
  loop
    if (v_start ->> 'starting_weight') is null then
      delete from public.user_exercise_settings
       where user_id = auth.uid()
         and day = v_start ->> 'day'
         and exercise_id = v_start ->> 'exercise_id'
         and program_id is not distinct from p_program_id;
    else
      insert into public.user_exercise_settings
        (user_id, program_id, day, exercise_id, starting_weight, updated_at)
      values (
        auth.uid(), p_program_id, v_start ->> 'day', v_start ->> 'exercise_id',
        (v_start ->> 'starting_weight')::numeric, now()
      )
      on conflict (user_id, coalesce(program_id, '00000000-0000-0000-0000-000000000000'::uuid), day, exercise_id)
      do update set starting_weight = excluded.starting_weight, updated_at = now();
    end if;
  end loop;
end;
$$;

revoke all on function public.import_program(jsonb) from public, anon;
revoke all on function public.adopt_orphan_history(uuid) from public, anon;
revoke all on function public.set_active_program(uuid) from public, anon;
revoke all on function public.save_workout(uuid, text, timestamptz, text, jsonb, uuid, integer) from public, anon;
revoke all on function public.save_starting_weights(jsonb, uuid) from public, anon;

grant execute on function public.import_program(jsonb) to authenticated;
grant execute on function public.adopt_orphan_history(uuid) to authenticated;
grant execute on function public.set_active_program(uuid) to authenticated;
grant execute on function public.save_workout(uuid, text, timestamptz, text, jsonb, uuid, integer) to authenticated;
grant execute on function public.save_starting_weights(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- import_backup, rebuilt on the program-aware signatures. Replaces everything
-- belonging to one program, leaving other programs' history alone.
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
    perform public.save_workout(
      null,
      v_workout ->> 'day',
      (v_workout ->> 'performed_at')::timestamptz,
      coalesce(v_workout ->> 'notes', ''),
      coalesce(v_workout -> 'exercises', '[]'::jsonb),
      p_program_id,
      (v_workout ->> 'week_number')::integer
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.import_backup(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.import_backup(jsonb, jsonb, uuid) to authenticated;
