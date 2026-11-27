// Belonging to more than one household (e.g. shopper for family, owner of your own).
// The open household is user_prefs.active_household_id; the database's security rules follow it.
import { supabase } from './supabase.js';
import { pendingCount, clearCache } from './shopping.js';
import { clearRecipeCache } from './data.js';

export const ROLE_LABEL = { owner: 'Owner', full: 'Full access', shopping: 'Shopping only' };

// All the person's households (oldest first) and which one is open.
export async function loadMemberships(userId) {
  const [{ data, error }, { data: pref }] = await Promise.all([
    supabase.from('household_members')
      .select('household_id, role, display_name, joined_at, households(id, name, settings, created_at)')
      .eq('user_id', userId)
      .order('joined_at'),
    supabase.from('user_prefs').select('active_household_id').eq('user_id', userId).maybeSingle()
  ]);
  if (error) throw error;
  const list = (data || []).filter((m) => m.households);
  const open = list.find((m) => m.household_id === pref?.active_household_id) || list[0] || null;
  return { list, open };
}

// Open another household: save the choice, clear the previous household's local copies, start fresh.
export async function switchHousehold(userId, householdId) {
  if (pendingCount()) throw new Error('Some shopping list changes are still waiting to sync. Switch when you have reception.');
  const { error } = await supabase.from('user_prefs')
    .upsert({ user_id: userId, active_household_id: householdId, updated_at: new Date().toISOString() });
  if (error) throw error;
  reopen();
}

// Start your own household (keeps your other memberships) and open it.
export async function startHousehold(name, displayName) {
  const { error } = await supabase.rpc('create_household', { p_name: name.trim(), p_display_name: (displayName || '').trim() });
  if (error) throw error;
  reopen();
}

// Join another household from an invite link and open it.
export async function joinHousehold(token, displayName) {
  const { error } = await supabase.rpc('accept_invite', { p_token: token, p_display_name: (displayName || '').trim() });
  if (error) throw error;
  reopen();
}

function reopen() {
  clearCache();
  clearRecipeCache();
  location.hash = '#/week';
  location.reload();
}
