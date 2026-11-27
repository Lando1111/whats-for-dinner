-- Garnish & toppings: ingredients served with the dish (taco toppings, herbs, lime wedges).
-- Shown in their own list on the recipe but still go on the shopping list.
alter table public.ingredients add column garnish boolean not null default false;
