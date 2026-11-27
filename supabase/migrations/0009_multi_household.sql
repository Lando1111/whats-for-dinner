-- People can belong to more than one household (e.g. a shopper for family, and owner of their own).
-- The household open in the app is user_prefs.active_household_id; every security rule keeps working
-- through private.my_household_id(), which now returns that household (if they're still a member),
-- otherwise the one they joined first.

alter table public.user_prefs
  add column active_household_id uuid references public.households (id) on delete set null;
create index user_prefs_active_household_idx on public.user_prefs (active_household_id);

alter table public.household_members drop constraint household_members_user_id_key;
create index household_members_user_id_idx on public.household_members (user_id);

create or replace function private.my_household_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.household_id
  from public.household_members m
  left join public.user_prefs p on p.user_id = m.user_id and p.active_household_id = m.household_id
  where m.user_id = auth.uid()
  order by (p.user_id is not null) desc, m.joined_at, m.household_id
  limit 1
$$;

create or replace function private.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.household_members
  where user_id = auth.uid() and household_id = private.my_household_id()
$$;

create or replace function private.can_edit() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role() in ('owner', 'full'), false)
$$;

-- See your own memberships in every household (for the switcher), plus everyone in the open household.
drop policy "members read members" on public.household_members;
create policy "members read members" on public.household_members
  for select to authenticated
  using (household_id = (select private.my_household_id()) or user_id = (select auth.uid()));

-- See the names of every household you belong to.
drop policy "members read household" on public.households;
create policy "members read household" on public.households
  for select to authenticated
  using (id = (select private.my_household_id())
    or id in (select household_id from public.household_members where user_id = (select auth.uid())));

create or replace function public.create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if (select count(*) from public.household_members where user_id = auth.uid() and role = 'owner') >= 3 then
    raise exception 'You already own 3 households';
  end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Our kitchen')) returning id into hid;
  insert into public.household_members (household_id, user_id, display_name, role)
    values (hid, auth.uid(), coalesce(trim(p_display_name), ''), 'owner');
  insert into public.user_prefs (user_id, active_household_id) values (auth.uid(), hid)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  return hid;
end $$;

create or replace function public.accept_invite(p_token text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.household_invites;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  select * into inv from public.household_invites where token = p_token for update;
  if inv.id is null or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'This invite link has expired or already been used';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid() and household_id = inv.household_id) then
    raise exception 'You are already in this household';
  end if;
  insert into public.household_members (household_id, user_id, display_name, role)
    values (inv.household_id, auth.uid(), coalesce(trim(p_display_name), ''), inv.role);
  update public.household_invites set used_at = now(), used_by = auth.uid() where id = inv.id;
  insert into public.user_prefs (user_id, active_household_id) values (auth.uid(), inv.household_id)
    on conflict (user_id) do update set active_household_id = excluded.active_household_id, updated_at = now();
  return inv.household_id;
end $$;
