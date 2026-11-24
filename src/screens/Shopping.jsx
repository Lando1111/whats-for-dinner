import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { supabase, friendly } from '../lib/supabase.js';
import { useRecipes } from '../lib/data.js';
import { fetchItems, fetchSections, cachedItems, run, flush, pendingCount, updateCache } from '../lib/shopping.js';
import { SECTIONS, SECTION_LABEL, sectionFor } from '../lib/sections.js';
import { parseIngredient } from '../lib/parse.js';
import { formatAmount } from '../lib/units.js';
import { Icon } from '../icons.jsx';

const UNDO_MS = 5000;

export function Shopping({ household, say, userId }) {
  const recipes = useRecipes() || [];
  const titleOf = useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r.title])), [recipes]);
  const [items, setItems] = useState(cachedItems);
  const [sections, setSections] = useState({});
  const [tab, setTab] = useState('buy');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [text, setText] = useState('');
  const [pending, setPending] = useState({}); // id → true while the undo timer runs
  const [snack, setSnack] = useState(null);
  const [edit, setEdit] = useState(null);
  const timers = useRef({});

  const load = useCallback(async () => {
    try {
      await flush();
      const [it, sec] = await Promise.all([fetchItems(), fetchSections()]);
      setItems(it); setSections(sec); setOffline(false);
    } catch { setOffline(true); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const on = () => { setOffline(false); load(); };
    const off = () => setOffline(true);
    addEventListener('online', on); addEventListener('offline', off);
    const ch = supabase.channel(`shop-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: `household_id=eq.${household.id}` }, () => load())
      .subscribe();
    return () => { removeEventListener('online', on); removeEventListener('offline', off); supabase.removeChannel(ch); Object.values(timers.current).forEach(clearTimeout); };
  }, [household.id, load]);

  const local = (fn) => { setItems((cur) => { const next = fn(cur); updateCache(() => next); return next; }); };

  async function act(op, localFn) {
    if (localFn) local(localFn);
    try { const sent = await run(op); if (!sent) setOffline(true); } catch (e) { say(friendly(e), true); load(); }
  }

  function tick(item) {
    if (pending[item.id]) return undo(item);
    setPending((p) => ({ ...p, [item.id]: true }));
    setSnack({ item, at: Date.now() });
    timers.current[item.id] = setTimeout(() => {
      delete timers.current[item.id];
      setPending((p) => { const n = { ...p }; delete n[item.id]; return n; });
      setSnack((s) => (s?.item.id === item.id ? null : s));
      const at = new Date().toISOString();
      act({ type: 'update', id: item.id, fields: { archived_at: at } }, (cur) => cur.map((x) => (x.id === item.id ? { ...x, archived_at: at } : x)));
    }, UNDO_MS);
  }

  function undo(item) {
    clearTimeout(timers.current[item.id]);
    delete timers.current[item.id];
    setPending((p) => { const n = { ...p }; delete n[item.id]; return n; });
    setSnack((s) => (s?.item.id === item.id ? null : s));
  }

  function add(e) {
    e.preventDefault();
    const p = parseIngredient(text);
    if (!p) return;
    const name = p.note && !p.quantity ? `${p.name}` : p.name;
    const row = { id: crypto.randomUUID(), household_id: household.id, name, quantity: p.quantity, unit: p.unit, category: sectionFor(name, sections), recipe_ids: [], created_by: userId, created_at: new Date().toISOString(), archived_at: null };
    setText('');
    act({ type: 'add', row }, (cur) => [...cur, row]);
  }

  function move(item, section) {
    const name = item.name.toLowerCase().trim();
    setSections((s) => ({ ...s, [name]: section }));
    act({ type: 'section', household_id: household.id, name, section });
    act({ type: 'update', id: item.id, fields: { category: section } }, (cur) => cur.map((x) => (x.id === item.id ? { ...x, category: section } : x)));
    setEdit(null);
  }

  const toBuy = items.filter((i) => !i.archived_at);
  const bought = items.filter((i) => i.archived_at).sort((a, b) => b.archived_at.localeCompare(a.archived_at));
  const groups = SECTIONS.map((s) => ({ ...s, items: toBuy.filter((i) => (i.category || sectionFor(i.name, sections)) === s.id) })).filter((g) => g.items.length);
  const amount = (i) => formatAmount({ q: i.quantity == null ? null : Number(i.quantity), unit: i.unit });
  const from = (i) => (i.recipe_ids?.length ? i.recipe_ids.map((id) => titleOf[id]).filter(Boolean).join(', ') : 'Added by hand');

  return (
    <main class="main">
      <header class="row-head">
        <h1 class="title">Shopping list</h1>
        <span class="cap" style="margin-left:auto;display:flex;align-items:center;gap:4px">
          {offline ? <>Offline{pendingCount() ? ` · ${pendingCount()} to sync` : ''}</> : <><Icon name="check" size={14} stroke={2.6} />Synced</>}
        </span>
      </header>
      {offline && <p class="cap" style="margin:0;padding:8px 12px;border-radius:12px;background:var(--duck);color:var(--ink)">No reception. You can keep ticking; changes sync when you're back online.</p>}

      <div class="seg" role="tablist">
        <button role="tab" aria-pressed={tab === 'buy' ? 'true' : 'false'} aria-selected={tab === 'buy'} onClick={() => setTab('buy')}>To buy · {toBuy.length - Object.keys(pending).length}</button>
        <button role="tab" aria-pressed={tab === 'bought' ? 'true' : 'false'} aria-selected={tab === 'bought'} onClick={() => setTab('bought')}>Bought</button>
      </div>

      {tab === 'buy' ? (
        <>
          <form onSubmit={add} style="display:flex;gap:8px">
            <label class="sr" for="add">Add an item</label>
            <input id="add" class="field" placeholder="Add an item, e.g. 2 L milk" value={text} onInput={(e) => setText(e.currentTarget.value)} />
            <button class="icon-btn" aria-label="Add item" style="width:48px;height:48px;background:var(--raised);box-shadow:var(--sh)" disabled={!text.trim()}><Icon name="plus" /></button>
          </form>
          {toBuy.length === 0 ? (
            <div class="empty">
              <img src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" />
              <p style="margin:0;font-weight:700">Nothing to buy</p>
              <p class="cap" style="margin:0;max-width:280px">Add things above, or use <strong>Build list</strong> on the Week screen to add what this week's meals need.</p>
            </div>
          ) : groups.map((g) => (
            <section>
              <h2 class="lbl">{g.label}</h2>
              <ul class="card shop">
                {g.items.map((i) => (
                  <li class={pending[i.id] ? 'done' : ''}>
                    <button class="tickbox" role="checkbox" aria-checked={pending[i.id] ? 'true' : 'false'} aria-label={i.name} onClick={() => tick(i)}>{pending[i.id] && <Icon name="check" size={18} stroke={3} />}</button>
                    <button class="shop-text" onClick={() => setEdit(i)} aria-label={`${i.name}, change section`}>
                      <span class="nm">{i.name}</span>
                      <span class="cap">{from(i)}</span>
                    </button>
                    <span class="qty">{amount(i)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        <>
          <p class="cap" style="margin:0">Bought in the last 30 days. Tap <strong>Put back</strong> if you need it again.</p>
          {bought.length === 0 ? <p class="cap" style="text-align:center;padding:24px 0">Nothing bought yet.</p> : (
            <ul class="card shop">
              {bought.map((i) => (
                <li>
                  <span class="shop-text"><span class="nm" style="text-decoration:line-through;color:var(--muted)">{i.name}</span><span class="cap">{amount(i)}</span></span>
                  <button class="link" style="margin-left:auto" onClick={() => act({ type: 'update', id: i.id, fields: { archived_at: null } }, (cur) => cur.map((x) => (x.id === i.id ? { ...x, archived_at: null } : x)))}>Put back</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {snack && (
        <div class="toast" role="status" style="display:flex;align-items:center;gap:10px;padding:6px 8px 6px 16px">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="10" fill="none" stroke="var(--line)" stroke-width="3" /><circle class="ring" key={snack.at} cx="13" cy="13" r="10" fill="none" stroke="var(--beet)" stroke-width="3" stroke-dasharray="62.8" transform="rotate(-90 13 13)" stroke-linecap="round" /></svg>
          <span style="flex:1">{snack.item.name} bought</span>
          <button class="link" onClick={() => undo(snack.item)}>Undo</button>
        </div>
      )}

      {edit && (
        <div class="scrim" onClick={(e) => e.target === e.currentTarget && setEdit(null)}>
          <section class="sheet" role="dialog" aria-label={`Move ${edit.name}`}>
            <div class="handle" />
            <div class="row-head"><h2 style="margin:0;font:600 22px/28px var(--display)">{edit.name}</h2><button class="icon-btn" style="margin-left:auto" aria-label="Close" onClick={() => setEdit(null)}><Icon name="close" /></button></div>
            <span class="lbl" style="margin:0">Which part of the shop?</span>
            <div class="chips">
              {SECTIONS.map((s) => (
                <button class="chipbtn" aria-pressed={(edit.category || sectionFor(edit.name, sections)) === s.id ? 'true' : 'false'} onClick={() => move(edit, s.id)}>{s.label}</button>
              ))}
            </div>
            <span class="cap">The app remembers this for next time.</span>
            <button class="link" style="align-self:flex-start;padding:0" onClick={() => { act({ type: 'delete', id: edit.id }, (cur) => cur.filter((x) => x.id !== edit.id)); setEdit(null); }}>Remove from list</button>
          </section>
        </div>
      )}
    </main>
  );
}

export { SECTION_LABEL };
