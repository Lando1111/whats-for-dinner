-- Supermarket sections for the shopping list.
-- The app guesses a section from a built-in keyword list; any change a person makes is remembered here per household.
alter table public.shopping_items
  add constraint shopping_items_category_check
  check (category is null or category in ('fruit_veg', 'meat_seafood', 'fridge', 'bakery', 'pantry', 'frozen', 'drinks', 'household', 'other'));

create table public.item_sections (
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (name = lower(name) and char_length(name) between 1 and 120),
  section text not null check (section in ('fruit_veg', 'meat_seafood', 'fridge', 'bakery', 'pantry', 'frozen', 'drinks', 'household', 'other')),
  primary key (household_id, name)
);

alter table public.item_sections enable row level security;

-- Everyone in the household, Shopping only included, can sort items into sections.
create policy "members read sections" on public.item_sections for select to authenticated
  using (household_id = (select private.my_household_id()));
create policy "members add sections" on public.item_sections for insert to authenticated
  with check (household_id = (select private.my_household_id()));
create policy "members change sections" on public.item_sections for update to authenticated
  using (household_id = (select private.my_household_id()))
  with check (household_id = (select private.my_household_id()));
create policy "members delete sections" on public.item_sections for delete to authenticated
  using (household_id = (select private.my_household_id()));
