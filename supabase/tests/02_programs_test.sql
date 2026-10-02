-- Programs-as-data: import, isolation between programs, and adoption of the
-- history that predates programs.
\set ON_ERROR_STOP on

\set uid_a '''11111111-1111-1111-1111-111111111111'''
\set uid_b '''22222222-2222-2222-2222-222222222222'''

truncate public.programs, public.workouts, public.user_exercise_settings, public.profiles cascade;
delete from auth.users;
insert into auth.users (id, email) values (:uid_a, 'a@example.com'), (:uid_b, 'b@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', :uid_a, false);

-- ---------------------------------------------------------------------------
-- A workout logged before programs existed
-- ---------------------------------------------------------------------------
select public.save_workout(null, 'Heavy Upper', '2026-01-02T10:00:00Z', 'pre-programs',
  '[{"exercise_id":"bench","name":"Bench Press","weight":135,"unit":"lb","rir":2,"reps":[8,7,6,6]}]'::jsonb);
select public.save_starting_weights('[{"day":"Heavy Upper","exercise_id":"bench","starting_weight":135}]'::jsonb);

do $$ begin
  if (select count(*) from public.workouts where program_id is null) = 1
    then raise notice 'PASS: history can exist without a program';
    else raise exception 'FAIL: expected one orphan workout';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Import two programs
-- ---------------------------------------------------------------------------
select public.import_program('{
  "slug":"lifts-3day","name":"Lifts 3-Day","weeks":null,
  "blocks":[{"name":"Ongoing","week_start":1,"week_end":null,"days":[
    {"name":"Heavy Upper","position":0,"exercises":[
      {"position":0,"key":"bench","name":"Bench Press","sets":4,"min_reps":5,"max_reps":8,
       "progression_type":"primary","unit":"lb","increment":5,"reset_reps":5,"rest_seconds":180}]}]}]
}'::jsonb) as lifts_id \gset
select set_config('lifts_test.lifts_id', :'lifts_id', false) as _ \gset

select public.import_program('{
  "slug":"essentials-3x","name":"Essentials 3x/Week","weeks":12,
  "blocks":[
    {"name":"Weeks 1-4","week_start":1,"week_end":4,"days":[
      {"name":"Upper","position":1,"exercises":[
        {"position":0,"key":"flat_db_press_heavy","name":"Flat DB Press (Heavy)","sets":1,
         "min_reps":4,"max_reps":6,"progression_type":"primary","unit":"lb","increment":5,
         "reset_reps":4,"rest_seconds":180,"target_rpe_low":8,"target_rpe_high":9},
        {"position":1,"key":"ez_bar_curl","name":"EZ Bar Curl","sets":2,"min_reps":12,"max_reps":15,
         "progression_type":"isolation","unit":"lb","increment":5,"reset_reps":12,"rest_seconds":90,
         "target_rpe_low":10,"target_rpe_high":10,"superset_group":"A2","dropset":false}]}]},
    {"name":"Weeks 5-8","week_start":5,"week_end":8,"days":[
      {"name":"Upper","position":1,"exercises":[
        {"position":0,"key":"weighted_dip_heavy","name":"Weighted Dip (Heavy)","sets":1,
         "min_reps":6,"max_reps":8,"progression_type":"primary","unit":"lb","increment":2.5,
         "reset_reps":6,"rest_seconds":180,"per_side":false}]}]}]
}'::jsonb) as ess_id \gset
select set_config('lifts_test.ess_id', :'ess_id', false) as _ \gset

do $$ begin
  if (select count(*) from public.programs) = 2
     and (select count(*) from public.program_blocks) = 3
     and (select count(*) from public.program_exercises) = 4
    then raise notice 'PASS: both programs imported with their blocks and exercises';
    else raise exception 'FAIL: import_program produced the wrong structure';
  end if;
  if (select superset_group from public.program_exercises where exercise_key = 'ez_bar_curl') = 'A2'
     and (select target_rpe_high from public.program_exercises where exercise_key = 'flat_db_press_heavy') = 9
    then raise notice 'PASS: superset and RPE fields round-trip';
    else raise exception 'FAIL: superset/RPE fields lost on import';
  end if;
end $$;

-- Re-importing replaces structure without orphaning the program row.
select public.import_program('{
  "slug":"essentials-3x","name":"Essentials 3x/Week","weeks":12,
  "blocks":[{"name":"Weeks 1-4","week_start":1,"week_end":4,"days":[
    {"name":"Upper","position":1,"exercises":[
      {"position":0,"key":"flat_db_press_heavy","name":"Flat DB Press (Heavy)","sets":1,
       "min_reps":4,"max_reps":6}]}]}]
}'::jsonb) as reimport \gset

do $$ begin
  if (select count(*) from public.programs) = 2
     and (select id::text from public.programs where slug = 'essentials-3x') = current_setting('lifts_test.ess_id')
     and (select count(*) from public.program_exercises
          where block_id in (select id from public.program_blocks
                             where program_id = current_setting('lifts_test.ess_id')::uuid)) = 1
    then raise notice 'PASS: re-import replaces structure and keeps the program id';
    else raise exception 'FAIL: re-import changed the program identity';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Adoption, then isolation
-- ---------------------------------------------------------------------------
select public.adopt_orphan_history(current_setting('lifts_test.lifts_id')::uuid) as adopted \gset

do $$ begin
  if (select count(*) from public.workouts
      where program_id = current_setting('lifts_test.lifts_id')::uuid) = 1
     and (select count(*) from public.workouts where program_id is null) = 0
     and (select count(*) from public.user_exercise_settings
          where program_id = current_setting('lifts_test.lifts_id')::uuid) = 1
    then raise notice 'PASS: pre-program history adopted without loss';
    else raise exception 'FAIL: adoption lost or missed history';
  end if;
end $$;

-- Log against the second program; the first must not see it.
select public.save_workout(null, 'Upper', '2026-02-01T10:00:00Z', 'essentials wk1',
  '[{"exercise_id":"flat_db_press_heavy","name":"Flat DB Press (Heavy)","weight":70,"unit":"lb","rir":1,"reps":[5]}]'::jsonb,
  current_setting('lifts_test.ess_id')::uuid, 1);

do $$ begin
  if (select count(*) from public.workouts
      where program_id = current_setting('lifts_test.lifts_id')::uuid) = 1
     and (select count(*) from public.workouts
          where program_id = current_setting('lifts_test.ess_id')::uuid) = 1
     and (select week_number from public.workouts
          where program_id = current_setting('lifts_test.ess_id')::uuid) = 1
    then raise notice 'PASS: workouts stay isolated per program, week recorded';
    else raise exception 'FAIL: program isolation broken';
  end if;
end $$;

-- The same exercise can hold a different baseline in each program.
select public.save_starting_weights(
  '[{"day":"Upper","exercise_id":"flat_db_press_heavy","starting_weight":70}]'::jsonb,
  current_setting('lifts_test.ess_id')::uuid);

do $$ begin
  if (select count(*) from public.user_exercise_settings) = 2
    then raise notice 'PASS: starting weights are per program';
    else raise exception 'FAIL: starting weights collided across programs';
  end if;
end $$;

-- Re-running adoption must not steal rows from the other program.
select public.adopt_orphan_history(current_setting('lifts_test.ess_id')::uuid) as again \gset
do $$ begin
  if (select count(*) from public.workouts
      where program_id = current_setting('lifts_test.lifts_id')::uuid) = 1
    then raise notice 'PASS: re-running adoption is a no-op';
    else raise exception 'FAIL: adoption moved already-assigned history';
  end if;
end $$;

-- Importing a backup for one program leaves the other untouched.
select public.import_backup('[]'::jsonb, '[]'::jsonb, current_setting('lifts_test.ess_id')::uuid);
do $$ begin
  if (select count(*) from public.workouts
      where program_id = current_setting('lifts_test.lifts_id')::uuid) = 1
     and (select count(*) from public.workouts
          where program_id = current_setting('lifts_test.ess_id')::uuid) = 0
    then raise notice 'PASS: backup import is scoped to one program';
    else raise exception 'FAIL: import_backup crossed program boundaries';
  end if;
end $$;

-- Active program
select public.set_active_program(current_setting('lifts_test.ess_id')::uuid);
do $$ begin
  if (select active_program_id from public.profiles where id = auth.uid())
       = current_setting('lifts_test.ess_id')::uuid
    then raise notice 'PASS: active program recorded';
    else raise exception 'FAIL: active program not set';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Another user sees none of it
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :uid_b, false);
do $$ begin
  if (select count(*) from public.programs) = 0
     and (select count(*) from public.program_blocks) = 0
     and (select count(*) from public.program_exercises) = 0
    then raise notice 'PASS: programs are invisible to other users';
    else raise exception 'FAIL: RLS leaked programs across users';
  end if;
end $$;

do $$
declare blocked boolean := false;
begin
  begin
    perform public.adopt_orphan_history(current_setting('lifts_test.lifts_id')::uuid);
  exception when others then blocked := true;
  end;
  if blocked
    then raise notice 'PASS: cannot adopt history into another user program';
    else raise exception 'FAIL: user B adopted into user A program';
  end if;
end $$;

reset role;
select 'All program tests passed.' as result;
