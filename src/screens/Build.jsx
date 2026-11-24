import { useEffect, useMemo, useState } from 'preact/hooks';
import { friendly } from '../lib/supabase.js';
import { useRecipes, isoDate, fromIso } from '../lib/data.js';
import { loadPlan, weekDatesFrom } from '../lib/plan.js';
import { convertLine, formatAmount, mergeKey } from '../lib/units.js';
import { fetchItems, fetchSections, run } from '../lib/shopping.js';
import { SECTIONS, sectionFor } from '../lib/sections.js';
import { go, back } from '../lib/router.js';
import { Icon } from '../icons.jsx';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Same unit family can be added up: g with kg, ml with L.
function addAmounts(a, b) {
  if (a.q == null || b.q == null) return { q: a.q ?? b.q, unit: a.unit ?? b.unit };
  const base = (x) => (x.unit === 'kg' ? { q: x.q * 1000, unit: 'g' } : x.unit === 'l' ? { q: x.q * 1000, unit: 'ml' } : x);
  const A = base(a); const B = base(b);
  if (A.unit !== B.unit) return null;
  const q = A.q + B.q;
  if (A.unit === 'g' && q >= 1000) return { q: q / 1000, unit: 'kg' };
  if (A.unit === 'ml' && q >= 1000) return { q: q / 1000, unit: 'l' };
  return { q, unit: A.unit };
}
const family = (u) => (u === 'kg' ? 'g' : u === 'l' ? 'ml' : u || '');

export function Build({ start, household, say, userId }) {
  const recipes = useRecipes();
  const [plan, setPlan] = useState(null);
  const [onList, setOnList] = useState([]);
  const [sections, setSections] = useState({});
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState(false);

  const startDate = start ? fromIso(start) : new Date();
  const dates = weekDatesFrom(startDate);
  const today = isoDate(new Date());

  useEffect(() => {
    loadPlan(dates[0], dates[6]).then(setPlan).catch((e) => say(friendly(e), true));
    fetchItems().then((it) => setOnList(it.filter((i) => !i.archived_at))).catch(() => {});
    fetchSections().then(setSections).catch(() => {});
  }, [dates[0]]);

  const lines = useMemo(() => {
    if (!plan || !recipes) return [];
    const rById = Object.fromEntries(recipes.map((r) => [r.id, r]));
    const merged = new Map();
    for (const night of plan.filter((p) => p.kind === 'cook' && p.date >= today)) {
      const r = rById[night.recipe_id];
      if (!r) continue;
      for (const ing of r.ingredients) {
        const amt = convertLine(ing, { system: r.measure_system, prefs: household.settings?.unit_prefs || {}, multiplier: night.multiplier || 1 });
        const key = mergeKey(ing.name, family(amt.unit));
        const prev = merged.get(key);
        const sum = prev ? addAmounts(prev.amt, amt) : amt;
        if (prev && sum) { prev.amt = sum; prev.recipes.add(r.id); prev.nights.add(night.date); }
        else merged.set(prev ? `${key}|${merged.size}` : key, { key, name: ing.name, amt, recipes: new Set([r.id]), nights: new Set([night.date]) });
      }
    }
    return [...merged.values()].map((l) => ({ ...l, section: sectionFor(l.name, sections) }));
  }, [plan, recipes, sections]);

  const onListKey = new Set(onList.map((i) => mergeKey(i.name, family(i.unit))));
  const count = Object.values(picked).filter(Boolean).length;
  const rTitle = (id) => recipes?.find((r) => r.id === id)?.title;

  async function addToList() {
    setBusy(true);
    try {
      const existing = await fetchItems().then((it) => it.filter((i) => !i.archived_at)).catch(() => onList);
      for (const l of lines.filter((x) => picked[x.key + x.name])) {
        const match = existing.find((i) => mergeKey(i.name, family(i.unit)) === l.key);
        const ids = [...l.recipes];
        if (match) {
          const sum = addAmounts({ q: match.quantity == null ? null : Number(match.quantity), unit: match.unit }, l.amt) || { q: match.quantity, unit: match.unit };
          await run({ type: 'update', id: match.id, fields: { quantity: sum.q, unit: sum.unit, recipe_ids: [...new Set([...(match.recipe_ids || []), ...ids])] } });
        } else {
          await run({ type: 'add', row: { id: crypto.randomUUID(), household_id: household.id, name: l.name, quantity: l.amt.q, unit: l.amt.unit, category: l.section, recipe_ids: ids, created_by: userId } });
        }
      }
      say(`${count} ${count === 1 ? 'item' : 'items'} added to the shopping list`);
      go('shopping');
    } catch (e) { say(friendly(e), true); }
    setBusy(false);
  }

  const cookNights = (plan || []).filter((p) => p.kind === 'cook' && p.date >= today);
  const groups = SECTIONS.map((s) => ({ ...s, lines: lines.filter((l) => l.section === s.id) })).filter((g) => g.lines.length);

  return (
    <main class="main no-tabs">
      <header class="row-head" style="gap:4px">
        <button class="icon-btn" aria-label="Back" style="margin-left:-10px" onClick={() => back('week')}><Icon name="back" /></button>
        <h1 class="title">Build shopping list</h1>
      </header>
      <p style="margin:0;font-size:15px;line-height:22px">Tick what you're <strong>missing</strong>. Everything else you've already got.</p>
      {plan && <p class="cap" style="margin:0">From {cookNights.length} {cookNights.length === 1 ? 'meal' : 'meals'}: {cookNights.map((n) => `${DAY[fromIso(n.date).getDay()]}${n.multiplier === 2 ? ' ×2' : ''}`).join(', ') || 'none planned yet'}. Leftovers and nights out need nothing.</p>}

      {!plan || !recipes ? <p class="cap">Loading…</p> : lines.length === 0 ? (
        <div class="empty"><p style="margin:0;font-weight:700">Nothing to build from</p><p class="cap" style="margin:0">Plan some meals for this week first.</p><a class="btn" href="#/week">Back to the week</a></div>
      ) : (
        <>
          <div style="display:flex;gap:8px">
            <button class="link" style="padding:0" onClick={() => setPicked(Object.fromEntries(lines.map((l) => [l.key + l.name, true])))}>Tick all</button>
            <button class="link" onClick={() => setPicked({})}>Clear</button>
          </div>
          {groups.map((g) => (
            <section>
              <h2 class="lbl">{g.label}</h2>
              <ul class="card shop">
                {g.lines.map((l) => {
                  const id = l.key + l.name;
                  const on = !!picked[id];
                  return (
                    <li>
                      <button class="tickbox" role="checkbox" aria-checked={on ? 'true' : 'false'} aria-label={`Missing ${l.name}`} onClick={() => setPicked({ ...picked, [id]: !on })}>{on && <Icon name="check" size={18} stroke={3} />}</button>
                      <span class="shop-text">
                        <span class="nm">{l.name}</span>
                        <span class="cap">{[...l.recipes].map(rTitle).filter(Boolean).join(', ')}{onListKey.has(l.key) ? ' · already on the list' : ''}</span>
                      </span>
                      <span class="qty">{formatAmount(l.amt)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div class="footer-bar">
            <button class="btn block" disabled={!count || busy} onClick={addToList}>{busy ? 'Adding…' : count ? `Add ${count} to shopping list` : 'Tick what you need'}</button>
          </div>
        </>
      )}
    </main>
  );
}
