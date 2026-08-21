-- Row Level Security and RPC behaviour tests.
-- Run with: ./scripts/test-db.sh
-- Every check raises a PASS/FAIL notice; any FAIL means user data is not isolated.

\set ON_ERROR_STOP on

\set uid_a '''11111111-1111-1111-1111-111111111111'''
\set uid_b '''22222222-2222-2222-2222-222222222222'''

truncate public.workouts, public.user_exercise_settings, public.profiles cascade;
delete from auth.users;
insert into auth.users (id, email) values
  (:uid_a, 'a@example.com'),
  (:uid_b, 'b@example.com');

set role authenticated;

-- ---------------------------------------------------------------------------
-- User A creates data
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :uid_a, false);

do $$ begin
  if (select count(*) from public.profiles) = 1
    then raise notice 'PASS: profile auto-created on signup';
    else raise exception 'FAIL: signup trigger did not create a profile';
  end if;
end $$;

select public.save_starting_weights(
  '[{"day":"Heavy Upper","exercise_id":"bench","starting_weight":135},
    {"day":"Legs + Abs","exercise_id":"squat","starting_weight":185}]'::jsonb);

select public.save_workout(null, 'Heavy Upper', '2026-01-02T10:00:00Z', 'felt strong',
  '[{"exercise_id":"bench","name":"Bench Press","weight":135,"unit":"lb","rir":2,"reps":[8,7,6,6]},
    {"exercise_id":"curl","name":"Curl","weight":30,"unit":"lb","rir":null,"reps":[12,11,10]}]'::jsonb)
  as workout_id \gset

-- psql variables are not interpolated inside DO blocks, so hand the workout id
-- over to them through a session setting.
select set_config('lifts_test.workout_id', :'workout_id', false) as _ \gset

do $$ begin
  if (select count(*) from public.workout_sets) = 7
    then raise notice 'PASS: workout saved with all sets';
    else raise exception 'FAIL: expected 7 sets, got %', (select count(*) from public.workout_sets);
  end if;
  if (select rir from public.workout_exercises where exercise_id = 'curl') is null
    then raise notice 'PASS: null RIR preserved';
    else raise exception 'FAIL: null RIR was not preserved';
  end if;
end $$;

-- Editing replaces exercises and sets wholesale, without orphans.
select public.save_workout(:'workout_id', 'Heavy Upper', '2026-01-02T10:00:00Z', 'edited notes',
  '[{"exercise_id":"bench","name":"Bench Press","weight":140,"unit":"lb","rir":1,"reps":[8,8,8,8]}]'::jsonb);

do $$ begin
  if (select count(*) from public.workouts) = 1
     and (select count(*) from public.workout_exercises) = 1
     and (select count(*) from public.workout_sets) = 4
     and (select notes from public.workouts) = 'edited notes'
    then raise notice 'PASS: edit replaced exercises/sets with no orphans';
    else raise exception 'FAIL: edit left stale rows behind';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- User B must not see or touch any of it
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :uid_b, false);

do $$ begin
  if (select count(*) from public.workouts) = 0
     and (select count(*) from public.workout_exercises) = 0
     and (select count(*) from public.workout_sets) = 0
     and (select count(*) from public.user_exercise_settings) = 0
    then raise notice 'PASS: user B sees none of user A data';
    else raise exception 'FAIL: RLS leaked user A data to user B';
  end if;
end $$;

do $$
declare blocked boolean := false; reason text;
begin
  begin
    perform public.save_workout(
      current_setting('lifts_test.workout_id')::uuid, 'Heavy Upper', now(), 'hacked', '[]'::jsonb);
  exception when others then blocked := true; reason := sqlerrm;
  end;
  if blocked
    then raise notice 'PASS: save_workout blocked for other users (%)', reason;
    else raise exception 'FAIL: user B edited user A workout through save_workout';
  end if;
end $$;

do $$
declare n integer;
begin
  update public.workouts set notes = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B updated % of user A rows', n; end if;

  delete from public.workouts;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: user B deleted % of user A rows', n; end if;

  raise notice 'PASS: direct update/delete of other users rows affects nothing';
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.workouts (user_id, day)
      values ('11111111-1111-1111-1111-111111111111'::uuid, 'Heavy Upper');
  exception when others then blocked := true;
  end;
  if blocked
    then raise notice 'PASS: forging a workout for another user is blocked';
    else raise exception 'FAIL: user B forged a workout owned by user A';
  end if;
end $$;

-- Reset only clears the caller's own data.
select public.delete_all_data();
select set_config('request.jwt.claim.sub', :uid_a, false);

do $$ begin
  if (select count(*) from public.workouts) = 1
     and (select count(*) from public.user_exercise_settings) = 2
    then raise notice 'PASS: another user reset did not touch user A data';
    else raise exception 'FAIL: delete_all_data crossed user boundaries';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Backup import replaces everything atomically
-- ---------------------------------------------------------------------------
select public.import_backup(
  '[{"day":"Volume Upper","exercise_id":"incline","starting_weight":50}]'::jsonb,
  '[{"day":"Volume Upper","performed_at":"2026-02-01T10:00:00Z","notes":"imported",
     "exercises":[{"exercise_id":"incline","name":"Incline DB Press","weight":50,"unit":"lb","rir":2,"reps":[10,9,9,8]}]},
    {"day":"Legs + Abs","performed_at":"2026-02-03T10:00:00Z","notes":"",
     "exercises":[{"exercise_id":"sideplank","name":"Side Plank","weight":0,"unit":"sec","rir":null,"reps":[45,40]}]}]'::jsonb
) as imported \gset

do $$ begin
  if (select count(*) from public.workouts) = 2
     and (select count(*) from public.user_exercise_settings) = 1
     and (select count(*) from public.workout_sets) = 6
    then raise notice 'PASS: import replaced all prior data';
    else raise exception 'FAIL: import did not replace data cleanly';
  end if;
end $$;

-- Deleting a workout cascades to its exercises and sets.
delete from public.workouts where day = 'Legs + Abs';
do $$ begin
  if (select count(*) from public.workouts) = 1
     and (select count(*) from public.workout_exercises) = 1
     and (select count(*) from public.workout_sets) = 4
    then raise notice 'PASS: deleting a workout cascades to exercises and sets';
    else raise exception 'FAIL: workout delete left orphaned rows';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Signed-out (anon) callers are locked out entirely
-- ---------------------------------------------------------------------------
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

do $$
declare blocked boolean := false; reason text; n integer;
begin
  begin
    select count(*) into n from public.workouts;
  exception when others then blocked := true; reason := sqlerrm;
  end;
  if blocked
    then raise notice 'PASS: anon cannot read workouts (%)', reason;
    else raise exception 'FAIL: anon read % workout rows', n;
  end if;
end $$;

do $$
declare blocked boolean := false; reason text;
begin
  begin
    perform public.save_workout(null, 'Heavy Upper', now(), '', '[]'::jsonb);
  exception when others then blocked := true; reason := sqlerrm;
  end;
  if blocked
    then raise notice 'PASS: anon cannot execute save_workout (%)', reason;
    else raise exception 'FAIL: anon executed save_workout';
  end if;
end $$;

reset role;
select 'All database tests passed.' as result;
