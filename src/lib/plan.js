// Week plan: reading and writing nights, leftovers, and the random picker.
import { supabase } from './supabase.js';
import { isoDate, fromIso, inSeason, seasonNow } from './data.js';

export async function loadPlan(fromIso, toIso) {
  const { data, error } = await supabase.from('meal_plan').select('*').gte('date', fromIso).lte('date', toIso).order('date');
  if (error) throw error;
  return data;
}

export async function upsertNight(householdId, date, fields) {
  const { data, error } = await supabase
    .from('meal_plan')
    .upsert({ household_id: householdId, date, ...fields }, { onConflict: 'household_id,date' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Put a recipe on a night. Leftovers nights that came from this night follow the new recipe.
export async function planRecipe(householdId, date, recipe, { multiplier = 1, existing = null } = {}) {
  const row = await upsertNight(householdId, date, {
    kind: 'cook',
    recipe_id: recipe.id,
    multiplier,
    makes_leftovers: existing?.kind === 'cook' && existing.recipe_id === recipe.id ? existing.makes_leftovers : !!recipe.makes_leftovers,
    note: null,
    leftovers_from_id: null
  });
  if (existing?.id) await supabase.from('meal_plan').update({ recipe_id: recipe.id }).eq('leftovers_from_id', existing.id);
  return row;
}

export async function clearNight(row) {
  if (!row?.id) return;
  await supabase.from('meal_plan').delete().eq('leftovers_from_id', row.id);
  const { error } = await supabase.from('meal_plan').delete().eq('id', row.id);
  if (error) throw error;
}

export async function updateNight(row, fields) {
  const { error } = await supabase.from('meal_plan').update(fields).eq('id', row.id);
  if (error) throw error;
}

// Make the chosen nights the leftovers of `source`; remove any it no longer has.
export async function setLeftoverNights(householdId, source, dates, plan) {
  const current = plan.filter((p) => p.leftovers_from_id === source.id);
  for (const p of current) if (!dates.includes(p.date)) await supabase.from('meal_plan').delete().eq('id', p.id);
  for (const date of dates) {
    if (current.some((p) => p.date === date)) continue;
    await upsertNight(householdId, date, { kind: 'leftovers', recipe_id: source.recipe_id, leftovers_from_id: source.id, multiplier: 1, makes_leftovers: false, locked: false, note: null });
  }
}

// ---------- random picks ----------
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/**
 * Choose a recipe for one night.
 * avoid: recipe ids used recently or elsewhere this week. needLeftovers: only recipes that make leftovers.
 */
export function pickRecipe(recipes, { date, avoid = new Set(), needLeftovers = false, wantVeg = false } = {}) {
  const season = seasonNow(date ? fromIso(date) : new Date());
  let pool = recipes.filter((r) => (!needLeftovers || r.makes_leftovers) && (!wantVeg || r.protein === 'vegetarian'));
  if (!pool.length && needLeftovers) pool = recipes.filter((r) => !wantVeg || r.protein === 'vegetarian');
  if (!pool.length) pool = recipes;
  const tiers = [
    pool.filter((r) => !avoid.has(r.id) && inSeason(r, season)),
    pool.filter((r) => !avoid.has(r.id)),
    pool
  ];
  const tier = tiers.find((t) => t.length) || [];
  return shuffle(tier)[0] || null;
}

/**
 * Fill every empty, unlocked night of the week.
 * Returns [{ date, recipe }] to save. Respects leftover weekdays, no-repeat weeks and minimum vegetarian nights.
 */
export function planFill({ recipes, weekDates, plan, recent, settings }) {
  const leftoverDays = settings?.leftover_weekdays || [];
  const minVeg = settings?.min_veg_nights || 0;
  const byDate = Object.fromEntries(plan.map((p) => [p.date, p]));
  const avoid = new Set([...recent, ...plan.filter((p) => p.recipe_id).map((p) => p.recipe_id)]);
  const empty = weekDates.filter((d) => !byDate[d]);
  const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
  let vegCount = plan.filter((p) => p.kind === 'cook' && recipeById[p.recipe_id]?.protein === 'vegetarian').length;
  const hasVeg = recipes.some((r) => r.protein === 'vegetarian');
  const out = [];
  const order = [...empty].sort((a, b) => (leftoverDays.includes(fromIso(b).getDay()) ? 1 : 0) - (leftoverDays.includes(fromIso(a).getDay()) ? 1 : 0));
  let vegStillNeeded = Math.max(0, minVeg - vegCount);
  order.forEach((date, i) => {
    const remaining = order.length - i;
    const needLeftovers = leftoverDays.includes(fromIso(date).getDay());
    const wantVeg = hasVeg && vegStillNeeded > 0 && (vegStillNeeded >= remaining || Math.random() < vegStillNeeded / remaining + 0.2);
    const recipe = pickRecipe(recipes, { date, avoid, needLeftovers, wantVeg });
    if (!recipe) return;
    avoid.add(recipe.id);
    if (recipe.protein === 'vegetarian') vegStillNeeded = Math.max(0, vegStillNeeded - 1);
    out.push({ date, recipe });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function weekDatesFrom(start) {
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return isoDate(d); });
}
