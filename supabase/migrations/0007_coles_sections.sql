-- Shop sections follow Coles' categories. Existing ids keep their meaning; new ones added:
-- deli, world (Dietary & World Foods), snacks (Chips, Chocolates & Snacks), health_beauty, baby, pet, liquor.
alter table public.shopping_items drop constraint if exists shopping_items_category_check;
alter table public.shopping_items add constraint shopping_items_category_check
  check (category is null or category in ('fruit_veg', 'meat_seafood', 'fridge', 'bakery', 'deli', 'pantry', 'world', 'snacks',
    'drinks', 'frozen', 'household', 'health_beauty', 'baby', 'pet', 'liquor', 'other'));

alter table public.item_sections drop constraint if exists item_sections_section_check;
alter table public.item_sections add constraint item_sections_section_check
  check (section in ('fruit_veg', 'meat_seafood', 'fridge', 'bakery', 'deli', 'pantry', 'world', 'snacks',
    'drinks', 'frozen', 'household', 'health_beauty', 'baby', 'pet', 'liquor', 'other'));
