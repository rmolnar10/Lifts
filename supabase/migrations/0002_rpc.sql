-- Lifts V5 — transactional RPCs.
--
-- A workout spans three tables, so saving it from the browser as three separate
-- PostgREST calls would leave partial data behind if one failed. These functions do
-- the whole thing in one statement-level transaction.
--
-- They are all SECURITY INVOKER: Row Level Security still applies, so a caller can
-- only ever touch their own rows. No service-role key is involved anywhere.

-- ---------------------------------------------------------------------------
-- save_workout: insert a new workout, or fully replace an existing one.
--
-- p_exercises is a JSON array:
--   [{ "exercise_id": "bench", "name": "Bench Press", "weight": 135,
--      "unit": "lb", "rir": 2, "reps": [8, 8, 7, 7] }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.save_workout(
  p_workout_id uuid,
  p_day text,
  p_performed_at timestamptz,
  p_notes text,
  p_exercises jsonb
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
    insert into public.workouts (user_id, day, performed_at, notes)
    values (auth.uid(), p_day, coalesce(p_performed_at, now()), coalesce(p_notes, ''))
    returning id into v_workout_id;
  else
    update public.workouts
       set day = p_day,
           performed_at = coalesce(p_performed_at, performed_at),
           notes = coalesce(p_notes, ''),
           updated_at = now()
     where id = p_workout_id
    returning id into v_workout_id;

    if v_workout_id is null then
      raise exception 'Workout % was not found', p_workout_id;
    end if;

    -- Replace the exercise/set rows wholesale; cascades clear the old sets.
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

-- ---------------------------------------------------------------------------
-- save_starting_weights: replace the caller's starting-weight settings.
--
-- p_starts is a JSON array:
--   [{ "day": "Heavy Upper", "exercise_id": "bench", "starting_weight": 135 }, ...]
-- A null/absent starting_weight clears that entry.
-- ---------------------------------------------------------------------------
create or replace function public.save_starting_weights(p_starts jsonb)
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
         and exercise_id = v_start ->> 'exercise_id';
    else
      insert into public.user_exercise_settings (user_id, day, exercise_id, starting_weight, updated_at)
      values (
        auth.uid(),
        v_start ->> 'day',
        v_start ->> 'exercise_id',
        (v_start ->> 'starting_weight')::numeric,
        now()
      )
      on conflict (user_id, day, exercise_id) do update
        set starting_weight = excluded.starting_weight,
            updated_at = now();
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- import_backup: atomically replace ALL of the caller's data with a JSON backup.
--
-- p_workouts is a JSON array:
--   [{ "day": "Heavy Upper", "performed_at": "2026-01-02T...", "notes": "",
--      "exercises": [ ...same shape as save_workout... ] }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.import_backup(p_starts jsonb, p_workouts jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workout jsonb;
  v_count integer := 0;
begin
  delete from public.workouts where user_id = auth.uid();
  delete from public.user_exercise_settings where user_id = auth.uid();

  perform public.save_starting_weights(p_starts);

  for v_workout in
    select value from jsonb_array_elements(coalesce(p_workouts, '[]'::jsonb))
  loop
    perform public.save_workout(
      null,
      v_workout ->> 'day',
      (v_workout ->> 'performed_at')::timestamptz,
      coalesce(v_workout ->> 'notes', ''),
      coalesce(v_workout -> 'exercises', '[]'::jsonb)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_all_data: the "Reset data" button.
-- ---------------------------------------------------------------------------
create or replace function public.delete_all_data()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.workouts where user_id = auth.uid();
  delete from public.user_exercise_settings where user_id = auth.uid();
end;
$$;

-- Only signed-in users may call these.
revoke all on function public.save_workout(uuid, text, timestamptz, text, jsonb) from public, anon;
revoke all on function public.save_starting_weights(jsonb) from public, anon;
revoke all on function public.import_backup(jsonb, jsonb) from public, anon;
revoke all on function public.delete_all_data() from public, anon;

grant execute on function public.save_workout(uuid, text, timestamptz, text, jsonb) to authenticated;
grant execute on function public.save_starting_weights(jsonb) to authenticated;
grant execute on function public.import_backup(jsonb, jsonb) to authenticated;
grant execute on function public.delete_all_data() to authenticated;
