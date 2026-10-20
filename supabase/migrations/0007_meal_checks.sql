-- Daily meal checklist: which of the day's fixed meals have been eaten.
--
--   meal_checks.checked  ids of the meals ticked off that day, as a JSON array
--   meal_checks.plan     the day's meals with their kcal and protein, as the
--                        meal switcher had them when the day was last ticked,
--                        so an old day keeps its own totals after a swap
--
-- Standalone: depends on nothing after 0001.

create table if not exists public.meal_checks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  checked jsonb not null default '[]'::jsonb,
  plan jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.meal_checks enable row level security;

drop policy if exists "meal_checks: select own" on public.meal_checks;
create policy "meal_checks: select own" on public.meal_checks for select using (auth.uid() = user_id);
drop policy if exists "meal_checks: insert own" on public.meal_checks;
create policy "meal_checks: insert own" on public.meal_checks for insert with check (auth.uid() = user_id);
drop policy if exists "meal_checks: update own" on public.meal_checks;
create policy "meal_checks: update own" on public.meal_checks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "meal_checks: delete own" on public.meal_checks;
create policy "meal_checks: delete own" on public.meal_checks for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- set_meal_checks: save one day's ticks and the plan they were made against.
-- ---------------------------------------------------------------------------
create or replace function public.set_meal_checks(
  p_day date,
  p_checked jsonb,
  p_plan jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_day is null then
    raise exception 'A date is required';
  end if;

  insert into public.meal_checks (user_id, day, checked, plan, updated_at)
  values (auth.uid(), p_day, coalesce(p_checked, '[]'::jsonb), p_plan, now())
  on conflict (user_id, day)
  do update set checked = excluded.checked, plan = excluded.plan, updated_at = now();
end;
$$;

grant execute on function public.set_meal_checks(date, jsonb, jsonb) to authenticated;
