-- Recipe types (so baking never lands on a dinner night) and weekly extras that don't take a dinner slot.
alter table public.recipes
  add column meal_type text not null default 'dinner'
  check (meal_type in ('dinner', 'baking', 'breakfast', 'snack', 'dessert', 'side'));

create table public.week_extras (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null, -- the Monday of the week
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  multiplier smallint not null default 1 check (multiplier in (1, 2)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.week_extras (household_id, week_start);
create index on public.week_extras (recipe_id);
create index on public.week_extras (created_by);

alter table public.week_extras enable row level security;
create policy "members read extras" on public.week_extras for select to authenticated
  using (household_id = (select private.my_household_id()));
create policy "editors add extras" on public.week_extras for insert to authenticated
  with check (household_id = (select private.my_household_id()) and (select private.can_edit()));
create policy "editors change extras" on public.week_extras for update to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()))
  with check (household_id = (select private.my_household_id()));
create policy "editors delete extras" on public.week_extras for delete to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()));

alter publication supabase_realtime add table public.week_extras;
