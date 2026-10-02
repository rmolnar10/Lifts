-- Reset is per program: wiping one program's history must not touch another's.

-- 0003 replaced user_exercise_settings' composite primary key with a surrogate
-- id plus an expression-based unique index. A live project running the
-- pre-programs save_starting_weights still infers ON CONFLICT
-- (user_id, day, exercise_id), which that expression index cannot satisfy, so a
-- plain unique index is kept alive in between. It has to go before a second
-- program can hold its own baseline for the same exercise.
drop index if exists public.user_exercise_settings_legacy_unique;
drop function if exists public.delete_all_data();

create or replace function public.delete_all_data(p_program_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_program_id is null then
    delete from public.workouts where user_id = auth.uid();
    delete from public.user_exercise_settings where user_id = auth.uid();
  else
    delete from public.workouts
     where user_id = auth.uid() and program_id = p_program_id;
    delete from public.user_exercise_settings
     where user_id = auth.uid() and program_id = p_program_id;
  end if;
end;
$$;

revoke all on function public.delete_all_data(uuid) from public, anon;
grant execute on function public.delete_all_data(uuid) to authenticated;
