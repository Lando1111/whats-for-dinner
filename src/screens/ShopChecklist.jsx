// "Tick what's missing" list for one or more recipes. Used by Build list (the week) and by a single recipe.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { friendly } from '../lib/supabase.js';
import { useRecipes } from '../lib/data.js';
import { convertLine, formatAmount, mergeKey } from '../lib/units.js';
import { fetchItems, fetchSections, run } from '../lib/shopping.js';
import { SECTIONS, sectionFor, memoryFor } from '../lib/sections.js';
import { Icon } from '../icons.jsx';

// Same unit family can be added up: g with kg, ml with L.
export function addAmounts(a, b) {
  if (a.q == null || b.q == null) return { q: a.q ?? b.q, unit: a.unit ?? b.unit };
  const base = (x) => (x.unit === 'kg' ? { q: x.q * 1000, unit: 'g' } : x.unit === 'l' ? { q: x.q * 1000, unit: 'ml' } : x);
  const A = base(a); const B = base(b);
  if (A.unit !== B.unit) return null;
  const q = A.q + B.q;
  if (A.unit === 'g' && q >= 1000) return { q: q / 1000, unit: 'kg' };
  if (A.unit === 'ml' && q >= 1000) return { q: q / 1000, unit: 'l' };
  return { q, unit: A.unit };
}
export const family = (u) => (u === 'kg' ? 'g' : u === 'l' ? 'ml' : u || '');

/** sources: [{ recipe_id, multiplier }] */
export function ShopChecklist({ sources, household, userId, say, onDone, sticky = true }) {
  const recipes = useRecipes();
  const [onList, setOnList] = useState([]);
  const [sections, setSections] = useState({});
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);
  const [allOrganic, setAllOrganic] = useState(false);
  const [organicPick, setOrganicPick] = useState({});

  useEffect(() => {
    fetchItems().then((it) => setOnList(it.filter((i) => !i.archived_at))).catch(() => {});
    fetchSections().then(setSections).catch(() => {});
  }, []);

  const lines = useMemo(() => {
    if (!recipes) return [];
    const rById = Object.fromEntries(recipes.map((r) => [r.id, r]));
    const merged = new Map();
    for (const src of sources) {
      const r = rById[src.recipe_id];
      if (!r) continue;
      for (const ing of r.ingredients) {
        const amt = convertLine(ing, { system: r.measure_system, prefs: household.settings?.unit_prefs || {}, multiplier: src.multiplier || 1 });
        const key = mergeKey(ing.name, family(amt.unit));
        const prev = merged.get(key);
        const sum = prev ? addAmounts(prev.amt, amt) : amt;
        if (prev && sum) { prev.amt = sum; prev.recipes.add(r.id); }
        else merged.set(prev ? `${key}|${merged.size}` : key, { key, name: ing.name, amt, recipes: new Set([r.id]) });
      }
    }
    return [...merged.values()].map((l) => ({ ...l, id: l.key + l.name, section: sectionFor(l.name, sections) }));
  }, [sources, recipes, sections]);

  const lineOrganic = (l) => organicPick[l.id] ?? !!memoryFor(l.name, sections)?.organic;
  const onListKey = new Set(onList.map((i) => mergeKey(i.name, family(i.unit))));
  const count = lines.filter((l) => picked[l.id]).length;
  const rTitle = (id) => recipes?.find((r) => r.id === id)?.title;
  const multi = new Set(sources.map((s) => s.recipe_id)).size > 1;

  async function addToList() {
    setBusy(true);
    try {
      const existing = await fetchItems().then((it) => it.filter((i) => !i.archived_at)).catch(() => onList);
      for (const l of lines.filter((x) => picked[x.id])) {
        const match = existing.find((i) => mergeKey(i.name, family(i.unit)) === l.key);
        const ids = [...l.recipes];
        const mem = memoryFor(l.name, sections);
        const organic = allOrganic || lineOrganic(l);
        const explicit = organicPick[l.id];
        if (explicit !== undefined && explicit !== !!mem?.organic) {
          await run({ type: 'memory', household_id: household.id, name: l.name.toLowerCase().trim(), section: l.section, organic: explicit, buy_note: mem?.buy_note ?? null });
        }
        if (match) {
          const sum = addAmounts({ q: match.quantity == null ? null : Number(match.quantity), unit: match.unit }, l.amt) || { q: match.quantity, unit: match.unit };
          await run({ type: 'update', id: match.id, fields: { quantity: sum.q, unit: sum.unit, organic: match.organic || organic, recipe_ids: [...new Set([...(match.recipe_ids || []), ...ids])] } });
        } else {
          await run({ type: 'add', row: { id: crypto.randomUUID(), household_id: household.id, name: l.name, quantity: l.amt.q, unit: l.amt.unit, category: l.section, organic, buy_note: mem?.buy_note || null, recipe_ids: ids, created_by: userId } });
        }
      }
      say(`${count} ${count === 1 ? 'item' : 'items'} added to the shopping list`);
      onDone();
    } catch (e) { say(friendly(e), true); }
    setBusy(false);
  }

  if (!recipes) return <p class="cap">Loading…</p>;
  if (!lines.length) return null;
  const groups = SECTIONS.map((s) => ({ ...s, lines: lines.filter((l) => l.section === s.id) })).filter((g) => g.lines.length);

  return (
    <>
      <div class="card">
        <div class="srow" style="border:0">
          <Icon name="leaf" /><span style="display:flex;flex-direction:column"><span>Buy organic</span><span class="cap">For everything you tick, this time</span></span>
          <button class="switch" role="switch" aria-checked={allOrganic ? 'true' : 'false'} aria-label="Buy organic for everything" onClick={() => setAllOrganic(!allOrganic)} />
        </div>
      </div>
      <p class="cap" style="margin:0">Or tap the leaf on a single item. The app remembers those, so the shopper sees them every time.</p>
      <div style="display:flex;gap:8px">
        <button class="link" style="padding:0" onClick={() => setPicked(Object.fromEntries(lines.map((l) => [l.id, true])))}>Tick all</button>
        <button class="link" onClick={() => setPicked({})}>Clear</button>
      </div>
      {groups.map((g) => (
        <section>
          <h2 class="lbl">{g.label}</h2>
          <ul class="card shop">
            {g.lines.map((l) => {
              const on = !!picked[l.id];
              const sub = [multi ? [...l.recipes].map(rTitle).filter(Boolean).join(', ') : '', onListKey.has(l.key) ? 'already on the list' : ''].filter(Boolean).join(' · ');
              return (
                <li>
                  <button class="tickbox" role="checkbox" aria-checked={on ? 'true' : 'false'} aria-label={`Missing ${l.name}`} onClick={() => setPicked({ ...picked, [l.id]: !on })}>{on && <Icon name="check" size={18} stroke={3} />}</button>
                  <span class="shop-text"><span class="nm">{l.name}</span>{sub && <span class="cap">{sub}</span>}</span>
                  <span class="qty">{formatAmount(l.amt)}</span>
                  <button class="leafbtn" aria-pressed={allOrganic || lineOrganic(l) ? 'true' : 'false'} disabled={allOrganic} aria-label={`Organic ${l.name}`}
                    onClick={() => setOrganicPick({ ...organicPick, [l.id]: !lineOrganic(l) })}><Icon name="leaf" size={18} /></button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div class={sticky ? 'footer-bar' : ''} style={sticky ? '' : 'display:flex'}>
        <button class="btn block" disabled={!count || busy} onClick={addToList}>{busy ? 'Adding…' : count ? `Add ${count} to shopping list` : 'Tick what you need'}</button>
      </div>
    </>
  );
}
