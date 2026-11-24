-- What's for dinner? core schema: households, people, invites, recipes, plan, shopping list.

-- Households and people -------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our kitchen' check (char_length(name) between 1 and 60),
  settings jsonb not null default jsonb_build_object(
    'no_repeat_weeks', 2,
    'min_veg_nights', 0,
    'leftover_weekdays', jsonb_build_array(),
    'unit_prefs', jsonb_build_object('dry', 'g', 'liquid', 'ml', 'butter', 'g')
  ),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  role text not null check (role in ('owner', 'full', 'shopping')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- one household per person
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  role text not null default 'full' check (role in ('full', 'shopping')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);
create index on public.household_invites (household_id);

-- Helpers (security definer so policies can look up membership without recursion)
create or replace function public.my_household_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.household_members where user_id = auth.uid()
$$;

create or replace function public.can_edit() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('owner', 'full') from public.household_members where user_id = auth.uid()), false)
$$;

-- Recipes ---------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  servings smallint not null default 4 check (servings between 1 and 50),
  method text[] not null default '{}',
  seasons text[] not null default '{all}',
  protein text check (protein in ('beef', 'chicken', 'lamb', 'pork', 'fish', 'vegetarian')),
  easy_fun boolean not null default false,
  makes_leftovers boolean not null default false,
  measure_system text not null default 'AU' check (measure_system in ('AU', 'US', 'UK', 'metric')),
  source_url text,
  source_note text,
  photo_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.recipes (household_id);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  position smallint not null default 0,
  quantity numeric,
  unit text,
  name text not null check (char_length(name) between 1 and 120),
  note text
);
create index on public.ingredients (recipe_id);
create index on public.ingredients (household_id);

create table public.ingredient_densities (
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  grams_per_cup numeric not null check (grams_per_cup > 0),
  primary key (household_id, name)
);

-- Week plan -------------------------------------------------------------------
create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('cook', 'leftovers', 'out')),
  recipe_id uuid references public.recipes(id) on delete set null,
  leftovers_from_id uuid references public.meal_plan(id) on delete set null,
  multiplier smallint not null default 1 check (multiplier in (1, 2)),
  makes_leftovers boolean not null default false,
  note text check (char_length(note) <= 80),
  locked boolean not null default false,
  cooked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, date)
);
create index on public.meal_plan (recipe_id);
create index on public.meal_plan (leftovers_from_id);

-- Shopping list ---------------------------------------------------------------
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity numeric,
  unit text,
  category text,
  recipe_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index on public.shopping_items (household_id, archived_at);

-- updated_at on recipes
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();

-- Row Level Security ------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.ingredient_densities enable row level security;
alter table public.meal_plan enable row level security;
alter table public.shopping_items enable row level security;

-- households: members read; owner renames/changes settings. Created only via create_household().
create policy "members read household" on public.households for select to authenticated
  using (id = (select public.my_household_id()));
create policy "owner updates household" on public.households for update to authenticated
  using (id = (select public.my_household_id()) and (select public.my_role()) = 'owner')
  with check (id = (select public.my_household_id()));

-- members: everyone in the household sees everyone; owner changes access; owner removes others; anyone but the owner can leave.
create policy "members read members" on public.household_members for select to authenticated
  using (household_id = (select public.my_household_id()));
create policy "owner changes access" on public.household_members for update to authenticated
  using (household_id = (select public.my_household_id()) and (select public.my_role()) = 'owner' and user_id <> auth.uid())
  with check (household_id = (select public.my_household_id()) and role in ('full', 'shopping'));
create policy "rename yourself" on public.household_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = (select public.my_role()));
create policy "owner removes or member leaves" on public.household_members for delete to authenticated
  using (household_id = (select public.my_household_id())
         and ((select public.my_role()) = 'owner' and user_id <> auth.uid()
              or user_id = auth.uid() and role <> 'owner'));

-- invites: owner only. Accepting goes through accept_invite().
create policy "owner reads invites" on public.household_invites for select to authenticated
  using (household_id = (select public.my_household_id()) and (select public.my_role()) = 'owner');
create policy "owner cancels invites" on public.household_invites for delete to authenticated
  using (household_id = (select public.my_household_id()) and (select public.my_role()) = 'owner');

-- recipes, ingredients, densities, plan: everyone reads; owner and full access write.
create policy "members read recipes" on public.recipes for select to authenticated
  using (household_id = (select public.my_household_id()));
create policy "editors write recipes" on public.recipes for all to authenticated
  using (household_id = (select public.my_household_id()) and (select public.can_edit()))
  with check (household_id = (select public.my_household_id()) and (select public.can_edit()));

create policy "members read ingredients" on public.ingredients for select to authenticated
  using (household_id = (select public.my_household_id()));
create policy "editors write ingredients" on public.ingredients for all to authenticated
  using (household_id = (select public.my_household_id()) and (select public.can_edit()))
  with check (household_id = (select public.my_household_id()) and (select public.can_edit())
              and exists (select 1 from public.recipes r where r.id = ingredients.recipe_id and r.household_id = ingredients.household_id));

create policy "members read densities" on public.ingredient_densities for select to authenticated
  using (household_id = (select public.my_household_id()));
create policy "editors write densities" on public.ingredient_densities for all to authenticated
  using (household_id = (select public.my_household_id()) and (select public.can_edit()))
  with check (household_id = (select public.my_household_id()) and (select public.can_edit()));

create policy "members read plan" on public.meal_plan for select to authenticated
  using (household_id = (select public.my_household_id()));
create policy "editors write plan" on public.meal_plan for all to authenticated
  using (household_id = (select public.my_household_id()) and (select public.can_edit()))
  with check (household_id = (select public.my_household_id()) and (select public.can_edit()));

-- shopping list: every member, including Shopping only, can add, tick and restore.
create policy "members use shopping list" on public.shopping_items for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

-- Functions the app calls ------------------------------------------------------
create or replace function public.create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You are already in a household';
  end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name), ''), 'Our kitchen')) returning id into hid;
  insert into public.household_members (household_id, user_id, display_name, role)
    values (hid, auth.uid(), coalesce(trim(p_display_name), ''), 'owner');
  return hid;
end $$;

create or replace function public.create_invite(p_role text default 'full') returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if (select public.my_role()) is distinct from 'owner' then raise exception 'Only the owner can invite people'; end if;
  if p_role not in ('full', 'shopping') then raise exception 'Unknown access level'; end if;
  insert into public.household_invites (household_id, role, created_by)
    values (public.my_household_id(), p_role, auth.uid()) returning token into t;
  return t;
end $$;

create or replace function public.accept_invite(p_token text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.household_invites;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'You are already in a household';
  end if;
  select * into inv from public.household_invites where token = p_token for update;
  if inv.id is null or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'This invite link has expired or already been used';
  end if;
  insert into public.household_members (household_id, user_id, display_name, role)
    values (inv.household_id, auth.uid(), coalesce(trim(p_display_name), ''), inv.role);
  update public.household_invites set used_at = now(), used_by = auth.uid() where id = inv.id;
  return inv.household_id;
end $$;

revoke execute on function public.create_household(text, text) from anon, public;
revoke execute on function public.create_invite(text) from anon, public;
revoke execute on function public.accept_invite(text, text) from anon, public;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.create_invite(text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
revoke execute on function public.my_household_id() from anon, public;
revoke execute on function public.my_role() from anon, public;
revoke execute on function public.can_edit() from anon, public;
grant execute on function public.my_household_id() to authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.can_edit() to authenticated;

-- Live sync for the two lists people watch together
alter publication supabase_realtime add table public.meal_plan, public.shopping_items;

-- Recipe photos: private bucket, one folder per household
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('recipe-photos', 'recipe-photos', false, 2097152, array['image/webp', 'image/jpeg', 'image/png']);

create policy "members read photos" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select public.my_household_id())::text);
create policy "editors add photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select public.my_household_id())::text and (select public.can_edit()));
create policy "editors replace photos" on storage.objects for update to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select public.my_household_id())::text and (select public.can_edit()));
create policy "editors delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select public.my_household_id())::text and (select public.can_edit()));
