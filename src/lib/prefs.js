// Personal settings that follow the person on every device (table user_prefs), with a local copy
// so they work offline. At the moment: the aisle order of the shop they use.
import { useEffect, useState } from 'preact/hooks';
import { supabase } from './supabase.js';
import { SECTIONS } from './sections.js';

const KEY = 'wfd-section-order';
let order = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } })();
const listeners = new Set();
let loading = null;

function setOrder(next) {
  order = Array.isArray(next) ? next : [];
  try { localStorage.setItem(KEY, JSON.stringify(order)); } catch { /* private mode */ }
  listeners.forEach((f) => f(order));
}

async function userId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}

function loadPrefs() {
  if (!loading) {
    loading = (async () => {
      const id = await userId();
      if (!id) return;
      const { data, error } = await supabase.from('user_prefs').select('section_order').eq('user_id', id).maybeSingle();
      if (!error && data) setOrder(data.section_order);
    })().catch(() => { loading = null; });
  }
  return loading;
}

export function useSectionOrder() {
  const [o, setO] = useState(order);
  useEffect(() => {
    listeners.add(setO);
    loadPrefs();
    return () => listeners.delete(setO);
  }, []);
  return o;
}

// Sections in the person's order. Any section they haven't placed keeps Coles' order, after theirs.
export function orderedSections(o = order) {
  const rank = (id) => { const i = o.indexOf(id); return i < 0 ? 100 + SECTIONS.findIndex((s) => s.id === id) : i; };
  return [...SECTIONS].sort((a, b) => rank(a.id) - rank(b.id));
}

export async function saveSectionOrder(next) {
  setOrder(next);
  const id = await userId();
  if (!id) return;
  const { error } = await supabase.from('user_prefs').upsert({ user_id: id, section_order: next, updated_at: new Date().toISOString() });
  if (error) throw error;
}
