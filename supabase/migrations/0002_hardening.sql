-- Move membership helpers out of the public API (they stay usable by policies).
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.my_household_id() set schema private;
alter function public.my_role() set schema private;
alter function public.can_edit() set schema private;

-- Functions that called the helpers by name
create or replace function public.create_invite(p_role text default 'full') returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if private.my_role() is distinct from 'owner' then raise exception 'Only the owner can invite people'; end if;
  if p_role not in ('full', 'shopping') then raise exception 'Unknown access level'; end if;
  insert into public.household_invites (household_id, role, created_by)
    values (private.my_household_id(), p_role, auth.uid()) returning token into t;
  return t;
end $$;

-- Re-evaluate auth.uid() once per query, not per row; one UPDATE policy on members.
drop policy "owner changes access" on public.household_members;
drop policy "rename yourself" on public.household_members;
drop policy "owner removes or member leaves" on public.household_members;

create policy "owner changes access or rename yourself" on public.household_members for update to authenticated
  using (household_id = (select private.my_household_id())
         and ((select private.my_role()) = 'owner' or user_id = (select auth.uid())))
  with check (household_id = (select private.my_household_id())
              and (
                (user_id <> (select auth.uid()) and role in ('full', 'shopping'))
                or (user_id = (select auth.uid()) and role = (select private.my_role()))
              ));
create policy "owner removes or member leaves" on public.household_members for delete to authenticated
  using (household_id = (select private.my_household_id())
         and (((select private.my_role()) = 'owner' and user_id <> (select auth.uid()))
              or (user_id = (select auth.uid()) and role <> 'owner')));

-- Split "for all" write policies so SELECT has a single policy each.
drop policy "editors write recipes" on public.recipes;
create policy "editors add recipes" on public.recipes for insert to authenticated
  with check (household_id = (select private.my_household_id()) and (select private.can_edit()));
create policy "editors change recipes" on public.recipes for update to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()))
  with check (household_id = (select private.my_household_id()));
create policy "editors delete recipes" on public.recipes for delete to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()));

drop policy "editors write ingredients" on public.ingredients;
create policy "editors add ingredients" on public.ingredients for insert to authenticated
  with check (household_id = (select private.my_household_id()) and (select private.can_edit())
              and exists (select 1 from public.recipes r where r.id = ingredients.recipe_id and r.household_id = ingredients.household_id));
create policy "editors change ingredients" on public.ingredients for update to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()))
  with check (household_id = (select private.my_household_id())
              and exists (select 1 from public.recipes r where r.id = ingredients.recipe_id and r.household_id = ingredients.household_id));
create policy "editors delete ingredients" on public.ingredients for delete to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()));

drop policy "editors write densities" on public.ingredient_densities;
create policy "editors add densities" on public.ingredient_densities for insert to authenticated
  with check (household_id = (select private.my_household_id()) and (select private.can_edit()));
create policy "editors change densities" on public.ingredient_densities for update to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()))
  with check (household_id = (select private.my_household_id()));
create policy "editors delete densities" on public.ingredient_densities for delete to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()));

drop policy "editors write plan" on public.meal_plan;
create policy "editors add plan" on public.meal_plan for insert to authenticated
  with check (household_id = (select private.my_household_id()) and (select private.can_edit()));
create policy "editors change plan" on public.meal_plan for update to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()))
  with check (household_id = (select private.my_household_id()));
create policy "editors delete plan" on public.meal_plan for delete to authenticated
  using (household_id = (select private.my_household_id()) and (select private.can_edit()));

-- Indexes for the remaining foreign keys
create index on public.household_invites (created_by);
create index on public.household_invites (used_by);
create index on public.recipes (created_by);
create index on public.shopping_items (created_by);
