-- Personal settings that follow the person, not the household (e.g. the aisle order of the shop they use).
create table public.user_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  section_order text[] not null default '{}' check (cardinality(section_order) <= 30),
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

create policy "read own prefs" on public.user_prefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "add own prefs" on public.user_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "change own prefs" on public.user_prefs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.user_prefs from anon;
grant select, insert, update on public.user_prefs to authenticated;
