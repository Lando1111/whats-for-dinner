import { supabase } from './supabase.js';
import { earnedTrophies, seenTrophies, markSeen, findSecret, eggsOn } from './eggs.js';

// Work out the household's trophies from its plan. Returns the earned set, the plan rows (for the
// anniversary card) and the names of any this phone hasn't announced yet.
export async function checkTrophies(household, recipes) {
  const [{ data: plan, error }, { count }] = await Promise.all([
    supabase.from('meal_plan').select('date, kind, recipe_id, multiplier').eq('household_id', household.id).order('date').limit(5000),
    supabase.from('week_extras').select('id', { count: 'exact', head: true }).eq('household_id', household.id)
  ]);
  if (error) throw error;
  const earned = earnedTrophies({ plan: plan || [], recipes: recipes || [], extrasCount: count || 0, createdAt: household.created_at });
  const seen = seenTrophies(household.id);
  const fresh = [...earned].filter((id) => !seen.has(id));
  markSeen(household.id, earned);
  return { earned, plan: plan || [], fresh };
}

// Announce a secret the first time it's found on this phone.
// Waits a moment so it doesn't cover the message for whatever triggered it.
export function secret(id, say, delay = 1800) {
  const name = findSecret(id);
  if (name && eggsOn()) setTimeout(() => say(`Secret trophy found: ${name}`), delay);
}
