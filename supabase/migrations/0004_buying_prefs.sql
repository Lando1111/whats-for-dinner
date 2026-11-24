-- Buying preferences: organic and a short note for the shopper (e.g. "free-range", a brand).
-- item_sections becomes the household's memory per item: section, organic, note.
alter table public.item_sections
  add column organic boolean not null default false,
  add column buy_note text check (buy_note is null or char_length(buy_note) <= 60);

alter table public.shopping_items
  add column organic boolean not null default false,
  add column buy_note text check (buy_note is null or char_length(buy_note) <= 60);
