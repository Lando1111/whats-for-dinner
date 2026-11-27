import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { supabase, friendly } from '../lib/supabase.js';
import { useRecipes } from '../lib/data.js';
import { fetchItems, fetchSections, cachedItems, run, flush, pendingCount, updateCache } from '../lib/shopping.js';
import { SECTIONS, SECTION_LABEL, sectionFor, memoryFor, guessSection } from '../lib/sections.js';
import { useSectionOrder, orderedSections } from '../lib/prefs.js';
import { AisleOrder } from './AisleOrder.jsx';
import { HouseholdSwitch, HouseholdChip } from './HouseholdSwitch.jsx';
import { parseIngredient } from '../lib/parse.js';
import { formatAmount } from '../lib/units.js';
import { Icon } from '../icons.jsx';
import { confetti, buzz, motionOn } from '../lib/motion.js';

const UNDO_MS = 5000;
const LEAVE_MS = 280; // ticked rows slide away before they move to Bought

export function Shopping({ household, say, userId, memberships }) {
  const [switching, setSwitching] = useState(false);
  const recipes = useRecipes() || [];
  const titleOf = useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r.title])), [recipes]);
  const [items, setItems] = useState(cachedItems);
  const [sections, setSections] = useState({});
  const [sectionsLoaded, setSectionsLoaded] = useState(false);
  const [aisles, setAisles] = useState(false);
  const aisleOrder = useSectionOrder();
  const [tab, setTab] = useState('buy');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [text, setText] = useState('');
  const [pending, setPending] = useState({}); // id → true while the undo timer runs
  const [leaving, setLeaving] = useState({}); // id → true while the row slides away
  const [cheer, setCheer] = useState(false); // this person just ticked off the last item
  const [snack, setSnack] = useState(null);
  const [edit, setEdit] = useState(null);
  const [note, setNote] = useState('');
  const timers = useRef({});

  const load = useCallback(async () => {
    try {
      await flush();
      const [it, sec] = await Promise.all([fetchItems(), fetchSections()]);
      setItems(it); setSections(sec); setSectionsLoaded(true); setOffline(false);
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
    const last = toBuy.length > 0 && toBuy.every((i) => i.id === item.id || pending[i.id]);
    if (last) { setCheer(true); confetti(); buzz([20, 60, 40]); } else buzz(10);
    timers.current[item.id] = setTimeout(() => {
      const archive = () => {
        delete timers.current[item.id];
        setPending((p) => { const n = { ...p }; delete n[item.id]; return n; });
        setLeaving((p) => { const n = { ...p }; delete n[item.id]; return n; });
        setSnack((s) => (s?.item.id === item.id ? null : s));
        const at = new Date().toISOString();
        act({ type: 'update', id: item.id, fields: { archived_at: at } }, (cur) => cur.map((x) => (x.id === item.id ? { ...x, archived_at: at } : x)));
      };
      if (!motionOn()) return archive();
      setLeaving((p) => ({ ...p, [item.id]: true }));
      timers.current[item.id] = setTimeout(archive, LEAVE_MS);
    }, UNDO_MS);
  }

  function undo(item) {
    clearTimeout(timers.current[item.id]);
    delete timers.current[item.id];
    setPending((p) => { const n = { ...p }; delete n[item.id]; return n; });
    setLeaving((p) => { const n = { ...p }; delete n[item.id]; return n; });
    setSnack((s) => (s?.item.id === item.id ? null : s));
    setCheer(false);
  }

  function add(e) {
    e.preventDefault();
    const p = parseIngredient(text);
    if (!p) return;
    const name = p.note && !p.quantity ? `${p.name}` : p.name;
    const mem = memoryFor(name, sections);
    const row = { id: crypto.randomUUID(), household_id: household.id, name, quantity: p.quantity, unit: p.unit, category: sectionFor(name, sections), organic: !!mem?.organic, buy_note: mem?.buy_note || null, recipe_ids: [], created_by: userId, created_at: new Date().toISOString(), archived_at: null };
    setText('');
    setCheer(false);
    act({ type: 'add', row }, (cur) => [...cur, row]);
  }

  // Remember the household's choice for this item (section, organic, note) for next time.
  function remember(item, patch) {
    const name = item.name.toLowerCase().trim();
    const mem = { section: sectionOf(item), organic: !!item.organic, buy_note: item.buy_note || null, ...(memoryFor(item.name, sections) || {}), ...patch };
    setSections((s) => ({ ...s, [name]: mem }));
    act({ type: 'memory', household_id: household.id, name, ...mem });
  }

  function move(item, section) {
    remember(item, { section });
    act({ type: 'update', id: item.id, fields: { category: section } }, (cur) => cur.map((x) => (x.id === item.id ? { ...x, category: section } : x)));
    setEdit(null);
  }

  function setPref(item, fields) {
    remember(item, fields);
    act({ type: 'update', id: item.id, fields }, (cur) => cur.map((x) => (x.id === item.id ? { ...x, ...fields } : x)));
    setEdit((e) => (e && e.id === item.id ? { ...e, ...fields } : e));
  }

  const toBuy = items.filter((i) => !i.archived_at);
  const bought = items.filter((i) => i.archived_at).sort((a, b) => b.archived_at.localeCompare(a.archived_at));
  // Where each item goes: the household's saved choice, then the built-in guess. The section stored on
  // the item is only used offline before saved choices have loaded.
  const sectionOf = (i) => memoryFor(i.name, sections)?.section || (sectionsLoaded ? guessSection(i.name) : i.category || guessSection(i.name));
  const groups = orderedSections(aisleOrder).map((s) => ({ ...s, items: toBuy.filter((i) => sectionOf(i) === s.id) })).filter((g) => g.items.length);
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
      <HouseholdChip memberships={memberships} household={household} onOpen={() => setSwitching(true)} />
      {switching && <HouseholdSwitch memberships={memberships} current={household.id} userId={userId} onClose={() => setSwitching(false)} say={say} />}
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
            cheer ? (
              <div class="empty">
                <img class="bounce" src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" />
                <p style="margin:0;font:600 22px/28px var(--display)">All bought!</p>
                <p class="cap" style="margin:0;max-width:280px">Everything's ticked off. Find it under <strong>Bought</strong> if you need to put something back.</p>
              </div>
            ) : (
              <div class="empty">
                <img src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" />
                <p style="margin:0;font-weight:700">Nothing to buy</p>
                <p class="cap" style="margin:0;max-width:280px">Add things above, or use <strong>Build list</strong> on the Week screen to add what this week's meals need.</p>
              </div>
            )
          ) : [<div class="row-head" style="gap:8px;flex-wrap:wrap"><p class="cap" style="margin:0;flex:1;min-width:180px">In the wrong part of the shop? Tap the item to move it.</p><button class="link" style="min-height:44px" onClick={() => setAisles(true)}>Aisle order</button></div>, ...groups.map((g) => (
            <section>
              <h2 class="lbl">{g.label}</h2>
              <ul class="card shop">
                {g.items.map((i) => (
                  <li class={`${pending[i.id] ? 'done' : ''}${leaving[i.id] ? ' leaving' : ''}`}>
                    <button class="tickbox" role="checkbox" aria-checked={pending[i.id] ? 'true' : 'false'} aria-label={i.name} onClick={() => tick(i)}>{pending[i.id] && <Icon name="check" size={18} stroke={3} />}</button>
                    <button class="shop-text" onClick={() => { setEdit(i); setNote(i.buy_note || ''); }} aria-label={`${i.name}${i.organic ? ', organic' : ''}. Change section or preferences`}>
                      <span class="nm">{i.name}{i.organic && <span class="chip organic"><Icon name="leaf" size={12} stroke={2.4} />Organic</span>}</span>
                      <span class="cap">{i.buy_note ? <strong style="color:var(--ink)">{i.buy_note} · </strong> : null}{from(i)}</span>
                    </button>
                    <span class="qty">{amount(i)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))]}
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
          <span style="flex:1">{cheer ? <strong>All done! </strong> : null}{snack.item.name} bought</span>
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
                <button class="chipbtn" aria-pressed={sectionOf(edit) === s.id ? 'true' : 'false'} onClick={() => move(edit, s.id)}>{s.label}</button>
              ))}
            </div>
            <span class="cap">Remembered for next time, whoever adds it.</span>
            <div class="srow">
              <Icon name="leaf" /><span style="display:flex;flex-direction:column"><span>Buy organic</span><span class="cap">Remembered for next time</span></span>
              <button class="switch" role="switch" aria-checked={edit.organic ? 'true' : 'false'} aria-label="Buy organic" onClick={() => setPref(edit, { organic: !edit.organic })} />
            </div>
            <div>
              <label class="lbl" for="bn">Note for the shopper</label>
              <input id="bn" class="field" maxLength={60} placeholder="e.g. free-range, or a brand" value={note} onInput={(e) => setNote(e.currentTarget.value)}
                onBlur={() => (note.trim() || null) !== (edit.buy_note || null) && setPref(edit, { buy_note: note.trim() || null })} />
            </div>
            <button class="link" style="align-self:flex-start;padding:0" onClick={() => { act({ type: 'delete', id: edit.id }, (cur) => cur.filter((x) => x.id !== edit.id)); setEdit(null); }}>Remove from list</button>
          </section>
        </div>
      )}
      {aisles && <AisleOrder onClose={() => setAisles(false)} say={say} />}
    </main>
  );
}

export { SECTION_LABEL };
