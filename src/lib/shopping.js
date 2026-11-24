// Shopping list data with an offline cache and a queue of changes made without reception.
import { supabase } from './supabase.js';

const CACHE = 'wfd-shopping-cache';
const QUEUE = 'wfd-shopping-queue';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

export const cachedItems = () => read(CACHE, []);
export const pendingCount = () => read(QUEUE, []).length;

export async function fetchItems() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await supabase
    .from('shopping_items')
    .select('*')
    .or(`archived_at.is.null,archived_at.gte.${since}`)
    .order('created_at');
  if (error) throw error;
  write(CACHE, data);
  return data;
}

export async function fetchSections() {
  const { data, error } = await supabase.from('item_sections').select('name, section');
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.name, r.section]));
}

async function apply(op) {
  if (op.type === 'add') return supabase.from('shopping_items').upsert(op.row);
  if (op.type === 'update') return supabase.from('shopping_items').update(op.fields).eq('id', op.id);
  if (op.type === 'delete') return supabase.from('shopping_items').delete().eq('id', op.id);
  if (op.type === 'section') return supabase.from('item_sections').upsert({ household_id: op.household_id, name: op.name, section: op.section });
  return { error: null };
}

// Try now; if there's no reception, keep it for later.
export async function run(op) {
  if (navigator.onLine) {
    const { error } = await apply(op);
    if (!error) return true;
    if (!/fetch|network/i.test(error.message || '')) throw error;
  }
  write(QUEUE, [...read(QUEUE, []), op]);
  return false;
}

export async function flush() {
  const queue = read(QUEUE, []);
  if (!queue.length || !navigator.onLine) return 0;
  const left = [];
  for (const op of queue) {
    try { const { error } = await apply(op); if (error && /fetch|network/i.test(error.message || '')) left.push(op); } catch { left.push(op); }
  }
  write(QUEUE, left);
  return queue.length - left.length;
}

export function updateCache(fn) { write(CACHE, fn(cachedItems())); }
