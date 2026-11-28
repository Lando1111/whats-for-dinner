-- Shopping list order within a section, set by dragging. Null = not placed yet (shown after placed items,
-- oldest first). Fractional so a move usually changes one row.
alter table public.shopping_items add column sort_key double precision;
