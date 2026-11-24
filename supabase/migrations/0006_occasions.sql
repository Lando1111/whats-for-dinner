-- Recipe tags for when a meal suits: weeknight (quicker), weekend (longer), hosting, slow cooking.
-- Replaces "Easy / fun". easy_fun stays for now so phones still on an older version can save;
-- drop it in a later migration.
alter table public.recipes
  add column occasions text[] not null default '{}';

alter table public.recipes
  add constraint recipes_occasions_check
  check (occasions <@ array['weeknight', 'weekend', 'hosting', 'slow_cook']::text[]);

update public.recipes set occasions = array['weeknight'] where easy_fun and occasions = '{}';
