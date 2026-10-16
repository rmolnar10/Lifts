-- V6 inputs: readiness, per-exercise form, and bodyweight, including isolation
-- between users.
\set ON_ERROR_STOP on

\set uid_a '''11111111-1111-1111-1111-111111111111'''
\set uid_b '''22222222-2222-2222-2222-222222222222'''

reset role;
truncate public.programs, public.workouts, public.user_exercise_settings, public.profiles,
         public.body_metrics cascade;
delete from auth.users;
insert into auth.users (id, email) values (:uid_a, 'a@example.com'), (:uid_b, 'b@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', :uid_a, false) as _ \gset

-- ---------------------------------------------------------------------------
-- form_ok round-trips through save_workout; omitting it stores null
-- ---------------------------------------------------------------------------
select public.save_workout(null, 'Heavy Upper', '2026-03-02T10:00:00Z', '',
  '[{"exercise_id":"bench","name":"Bench Press","weight":135,"unit":"lb","rir":2,"form_ok":false,"reps":[8,7,6,6]},
    {"exercise_id":"curl","name":"Machine Curl","weight":40,"unit":"lb","rir":1,"reps":[12,11,10]}]'::jsonb)
  as w1 \gset

do $$ begin
  if (select form_ok from public.workout_exercises where exercise_id = 'bench') = false
     and (select form_ok from public.workout_exercises where exercise_id = 'curl') is null
    then raise notice 'PASS: form_ok is stored, and absent means not recorded';
    else raise exception 'FAIL: form_ok did not round-trip';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- readiness
-- ---------------------------------------------------------------------------
select public.set_workout_readiness(:'w1', 'rough') is null as _ \gset

do $$ begin
  if (select readiness from public.workouts) = 'rough'
    then raise notice 'PASS: readiness is stored';
    else raise exception 'FAIL: readiness was not stored';
  end if;
end $$;

do $$ begin
  begin
    perform public.set_workout_readiness((select id from public.workouts limit 1), 'exhausted');
    raise exception 'FAIL: an unknown readiness value was accepted';
  exception when check_violation then
    raise notice 'PASS: readiness only accepts rough / normal / good';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- import_backup restores readiness and form
-- ---------------------------------------------------------------------------
select public.import_backup('[]'::jsonb, '[
  {"day":"Heavy Upper","performed_at":"2026-03-09T10:00:00Z","notes":"","readiness":"good",
   "exercises":[{"exercise_id":"bench","name":"Bench Press","weight":140,"unit":"lb","rir":2,
                 "form_ok":true,"reps":[6,6,5,5]}]}]'::jsonb) as _ \gset

do $$ begin
  if (select readiness from public.workouts) = 'good'
     and (select form_ok from public.workout_exercises) = true
    then raise notice 'PASS: import_backup restores readiness and form';
    else raise exception 'FAIL: import_backup lost readiness or form';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- bodyweight: log, correct, clear
-- ---------------------------------------------------------------------------
select public.log_bodyweight('2026-03-01', 182.4) is null as _ \gset
select public.log_bodyweight('2026-03-08', 181.0) is null as _ \gset
select public.log_bodyweight('2026-03-08', 180.6) is null as _ \gset

do $$ begin
  if (select count(*) from public.body_metrics) = 2
     and (select weight from public.body_metrics where measured_on = '2026-03-08') = 180.6
    then raise notice 'PASS: one bodyweight per day, latest entry wins';
    else raise exception 'FAIL: bodyweight upsert misbehaved';
  end if;
end $$;

select public.log_bodyweight('2026-03-01', null) is null as _ \gset

do $$ begin
  if (select count(*) from public.body_metrics) = 1
    then raise notice 'PASS: a null weight clears that day';
    else raise exception 'FAIL: clearing a bodyweight entry failed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- isolation: user B sees none of A's bodyweight and cannot touch A's workout
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', :uid_b, false) as _ \gset

do $$ begin
  if (select count(*) from public.body_metrics) = 0
    then raise notice 'PASS: bodyweight is private to its owner';
    else raise exception 'FAIL: user B can see user A''s bodyweight';
  end if;
end $$;

reset role;
select id as a_workout from public.workouts limit 1 \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :uid_b, false) as _ \gset
select set_config('lifts_test.a_workout', :'a_workout', false) as _ \gset

do $$ begin
  begin
    perform public.set_workout_readiness(current_setting('lifts_test.a_workout')::uuid, 'rough');
    raise exception 'FAIL: user B changed user A''s readiness';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: readiness cannot be set on another user''s workout';
  end;
end $$;

set role anon;
select set_config('request.jwt.claim.sub', '', false) as _ \gset

do $$ begin
  begin
    perform public.log_bodyweight('2026-03-10', 180);
    raise exception 'FAIL: anon could log a bodyweight';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot log a bodyweight';
  end;
end $$;

reset role;
