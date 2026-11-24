import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { supabase, friendly } from '../lib/supabase.js';
import { useRecipes, usePhotoUrls, isoDate, fromIso } from '../lib/data.js';
import { loadPlan, planRecipe, clearNight, updateNight, upsertNight, setLeftoverNights, pickRecipe, planFill, weekDatesFrom } from '../lib/plan.js';
import { Recipes } from './Recipes.jsx';
import { Icon } from '../icons.jsx';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekStart(offsetWeeks = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d;
}

const dayLabel = (iso) => { const d = fromIso(iso); return `${DAY[d.getDay()]} ${d.getDate()}`; };

export function Week({ household, member, say }) {
  const canEdit = member.role !== 'shopping';
  const recipes = useRecipes();
  const [offset, setOffset] = useState(0);
  const [plan, setPlan] = useState([]);
  const [recent, setRecent] = useState([]);
  const [open, setOpen] = useState(null); // date iso
  const [busy, setBusy] = useState(false);

  const start = weekStart(offset);
  const dates = weekDatesFrom(start);
  const todayIso = isoDate(new Date());
  const repeatWeeks = household.settings?.no_repeat_weeks ?? 2;

  const load = useCallback(async () => {
    try {
      const from = new Date(start); from.setDate(from.getDate() - repeatWeeks * 7);
      const rows = await loadPlan(isoDate(from), dates[6]);
      setPlan(rows.filter((r) => r.date >= dates[0]));
      setRecent(rows.filter((r) => r.date < dates[0] && r.recipe_id).map((r) => r.recipe_id));
    } catch (e) { say(friendly(e), true); }
  }, [dates[0], repeatWeeks]);

  useEffect(() => { load(); }, [load]);

  // Live updates from the other phone.
  useEffect(() => {
    const ch = supabase.channel(`plan-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan', filter: `household_id=eq.${household.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [household.id, load]);

  const byDate = useMemo(() => Object.fromEntries(plan.map((p) => [p.date, p])), [plan]);
  const rById = useMemo(() => Object.fromEntries((recipes || []).map((r) => [r.id, r])), [recipes]);
  const urls = usePhotoUrls(plan.map((p) => rById[p.recipe_id]?.photo_path));

  async function fill() {
    if (!recipes?.length) return say('Add some recipes first.', true);
    setBusy(true);
    try {
      const picks = planFill({ recipes, weekDates: dates.filter((d) => d >= todayIso), plan, recent, settings: household.settings });
      for (const { date, recipe } of picks) await planRecipe(household.id, date, recipe);
      await load();
      say(picks.length ? `Filled ${picks.length} ${picks.length === 1 ? 'night' : 'nights'}. Tap any night to change it.` : 'No empty nights left to fill.');
    } catch (e) { say(friendly(e), true); }
    setBusy(false);
  }

  const end = fromIso(dates[6]);
  const range = `${DAY[start.getDay()]} ${start.getDate()}${start.getMonth() !== end.getMonth() ? ' ' + MON[start.getMonth()] : ''} – ${DAY[end.getDay()]} ${end.getDate()} ${MON[end.getMonth()]}`;
  const label = offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : `${Math.abs(offset)} weeks ${offset > 0 ? 'ahead' : 'ago'}`;
  const emptyFuture = dates.filter((d) => d >= todayIso && !byDate[d]).length;

  return (
    <main class="main">
      <header class="row-head">
        <img src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" width="36" height="36" />
        <h1 class="title">What's for dinner?</h1>
      </header>
      <div class="row-head" style="gap:4px">
        <button class="icon-btn" aria-label="Previous week" onClick={() => setOffset(offset - 1)}><Icon name="back" /></button>
        <div style="display:flex;flex-direction:column">
          <span style="font-size:18px;line-height:22px;font-weight:700">{label}</span>
          <span class="cap">{range}</span>
        </div>
        <button class="icon-btn" aria-label="Next week" onClick={() => setOffset(offset + 1)}><Icon name="next" /></button>
        {canEdit && <a class="btn outline" href={`#/build/${dates[0]}`} style="margin-left:auto;height:44px;padding:0 14px;font-size:14px;gap:6px"><Icon name="cart" size={20} />Build list</a>}
      </div>

      <div class="grid2">
        {dates.map((iso) => {
          const p = byDate[iso];
          const r = p && rById[p.recipe_id];
          const isToday = iso === todayIso;
          const past = iso < todayIso;
          const kind = !p ? 'empty' : p.kind === 'leftovers' ? 'left' : p.kind;
          const src = p?.leftovers_from_id && plan.find((x) => x.id === p.leftovers_from_id);
          const title = !p ? 'Nothing planned' : p.kind === 'out' ? 'Out for dinner' : p.kind === 'leftovers' ? `Leftovers: ${r?.title || 'meal'}` : r?.title || 'Recipe removed';
          const sub = !p ? (canEdit && !past ? 'Tap to choose' : '') : p.kind === 'out' ? p.note || '' : p.kind === 'leftovers' ? (src ? `From ${LONG[fromIso(src.date).getDay()]}` : '') : [p.locked && 'Locked', p.makes_leftovers && 'Makes leftovers'].filter(Boolean).join(' · ');
          const photo = r?.photo_path && urls[r.photo_path];
          return (
            <button class={`tile ${kind === 'empty' ? '' : kind}${isToday ? ' today' : ''}${past ? ' past' : ''}`}
              aria-label={`${LONG[fromIso(iso).getDay()]} ${fromIso(iso).getDate()}: ${title}`}
              onClick={() => (canEdit ? setOpen(iso) : r && (location.hash = `#/recipe/${r.id}`))}>
              <div class="pic">
                {kind === 'out' ? <Icon name="out" size={32} stroke={1.8} /> : photo ? <img src={photo} alt="" /> : kind === 'empty' ? <Icon name="plus" size={28} /> : <Icon name="bowl" size={30} stroke={1.8} />}
                <span class="day">{isToday ? `Tonight · ${dayLabel(iso)}` : dayLabel(iso)}{p?.locked && <Icon name="lock" size={13} stroke={2.6} />}</span>
                {p?.multiplier === 2 && <span class="badge">×2</span>}
              </div>
              <div class="body">
                <span class="clamp" style="font-size:15px;line-height:19px;font-weight:700;min-height:38px">{title}</span>
                <span class="cap" style={kind === 'left' ? 'color:var(--ink)' : ''}>{sub}</span>
              </div>
            </button>
          );
        })}
        <button class="tile fill" disabled={!canEdit || busy || !emptyFuture} onClick={fill}>
          <Icon name="dice" size={40} stroke={1.8} />
          <span style="font:600 22px/26px var(--display)">{busy ? 'Filling…' : 'Fill the week'}</span>
          <span style="font-size:13px;line-height:17px">{!canEdit ? 'Ask someone with full access' : emptyFuture ? 'Fills empty nights, keeps locked ones' : 'Every night is planned'}</span>
        </button>
      </div>

      {open && (
        <NightSheet
          date={open} plan={plan} recipes={recipes || []} household={household} say={say} recent={recent}
          onChange={load} onClose={() => setOpen(null)} />
      )}
    </main>
  );
}

function NightSheet({ date, plan, recipes, household, say, recent, onChange, onClose }) {
  const row = plan.find((p) => p.date === date);
  const rById = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const recipe = row && rById[row.recipe_id];
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState(row?.note || '');
  const urls = usePhotoUrls([recipe?.photo_path]);
  const d = fromIso(date);
  const isToday = date === isoDate(new Date());

  async function run(fn, msg) {
    try { await fn(); await onChange(); if (msg) say(msg); } catch (e) { say(friendly(e), true); }
  }

  const choose = (r) => run(() => planRecipe(household.id, date, r, { multiplier: row?.multiplier || 1, existing: row?.kind === 'cook' ? row : null }));

  function surprise() {
    const avoid = new Set([...recent, ...plan.filter((p) => p.recipe_id && p.date !== date).map((p) => p.recipe_id), row?.recipe_id].filter(Boolean));
    const needLeftovers = (household.settings?.leftover_weekdays || []).includes(d.getDay());
    const r = pickRecipe(recipes, { date, avoid, needLeftovers });
    if (!r) return say('Add some recipes first.', true);
    choose(r);
  }

  async function setOut(on) {
    if (on) {
      await run(async () => {
        if (row?.id) await supabase.from('meal_plan').delete().eq('leftovers_from_id', row.id);
        await upsertNight(household.id, date, { kind: 'out', recipe_id: null, leftovers_from_id: null, multiplier: 1, makes_leftovers: false, note: note || null });
      });
    } else {
      await run(() => clearNight(row));
    }
  }

  // Later nights (within the next 6) that could take leftovers from this one.
  const later = Array.from({ length: 6 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i + 1); return isoDate(x); });
  const mine = plan.filter((p) => row && p.leftovers_from_id === row.id).map((p) => p.date);
  const why = (iso) => {
    const p = plan.find((x) => x.date === iso);
    if (!p || mine.includes(iso)) return null;
    if (p.locked) return 'locked';
    if (p.kind === 'out') return 'out';
    if (p.kind === 'leftovers') return 'other leftovers';
    return 'planned';
  };
  const leftoverDate = row?.kind === 'leftovers' && plan.find((p) => p.id === row.leftovers_from_id);

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      {picking ? (
        <section class="sheet full" role="dialog" aria-label="Pick a recipe">
          <Recipes pick onPick={(r) => { setPicking(false); if (r) choose(r); }} />
        </section>
      ) : (
        <section class="sheet" role="dialog" aria-label={`${LONG[d.getDay()]} ${d.getDate()}`}>
          <div class="handle" />
          <div class="row-head">
            <div style="display:flex;flex-direction:column">
              <h2 style="margin:0;font:600 24px/30px var(--display)">{LONG[d.getDay()]} {d.getDate()}</h2>
              {isToday && <span class="cap">Tonight</span>}
            </div>
            <button class="icon-btn" style="margin-left:auto" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
          </div>

          {row?.kind === 'cook' && recipe && (
            <a href={`#/recipe/${recipe.id}`} class="listrow" style="min-height:72px;background:var(--surface);border-radius:16px;padding:8px;border:0">
              {urls[recipe.photo_path] ? <img class="thumb" style="width:72px;height:56px" src={urls[recipe.photo_path]} alt="" /> : <span class="thumb" style="width:72px;height:56px;background:var(--duck);display:flex;align-items:center;justify-content:center"><Icon name="bowl" /></span>}
              <span style="display:flex;flex-direction:column"><span style="font-weight:700">{recipe.title}</span><span class="cap">Tap to open the recipe</span></span>
              <span style="margin-left:auto"><Icon name="next" size={20} /></span>
            </a>
          )}
          {row?.kind === 'leftovers' && (
            <p style="margin:0;padding:12px;border-radius:16px;background:var(--butter)"><strong>Leftovers: {recipe?.title || 'meal'}</strong>{leftoverDate ? <span> from {LONG[fromIso(leftoverDate.date).getDay()]}</span> : null}. Nothing to buy for tonight.</p>
          )}

          {row?.kind !== 'out' && (
            <div class="grid2" style="gap:8px">
              <button class="btn outline" style="height:48px;font-size:15px" onClick={() => setPicking(true)}><Icon name="search" size={20} />Pick a recipe</button>
              <button class="btn outline" style="height:48px;font-size:15px" onClick={surprise}><Icon name="dice" size={20} stroke={1.8} />Surprise me</button>
            </div>
          )}

          <div>
            <div class="srow">
              <Icon name="out" /><span style="display:flex;flex-direction:column"><span>Out for dinner</span><span class="cap">No cooking, nothing to buy</span></span>
              <button class="switch" role="switch" aria-checked={row?.kind === 'out' ? 'true' : 'false'} aria-label="Out for dinner" onClick={() => setOut(row?.kind !== 'out')} />
            </div>
            {row?.kind === 'out' && (
              <div class="srow" style="padding:8px 0 8px 34px">
                <label class="sr" for="note">Note</label>
                <input id="note" class="field" maxLength={80} placeholder="e.g. Dinner at Nan's" value={note} onInput={(e) => setNote(e.currentTarget.value)} onBlur={() => note !== (row.note || '') && run(() => updateNight(row, { note: note || null }))} />
              </div>
            )}
            {row && (
              <div class="srow">
                <Icon name="lock" /><span style="display:flex;flex-direction:column"><span>Lock this night</span><span class="cap">Fill the week won't change it</span></span>
                <button class="switch" role="switch" aria-checked={row.locked ? 'true' : 'false'} aria-label="Lock this night" onClick={() => run(() => updateNight(row, { locked: !row.locked }))} />
              </div>
            )}
            {row?.kind === 'cook' && (
              <>
                <div class="srow">
                  <span style="width:24px;text-align:center;font:600 16px var(--display)">×2</span><span style="display:flex;flex-direction:column"><span>Double it</span><span class="cap">{recipe ? `Serves ${recipe.servings * 2} · ` : ''}shopping doubles too</span></span>
                  <button class="switch" role="switch" aria-checked={row.multiplier === 2 ? 'true' : 'false'} aria-label="Double it" onClick={() => run(() => updateNight(row, { multiplier: row.multiplier === 2 ? 1 : 2 }))} />
                </div>
                <div class="srow" style={row.makes_leftovers ? 'border-bottom:0' : ''}>
                  <Icon name="bowl" /><span style="display:flex;flex-direction:column"><span>Make leftovers</span><span class="cap">Pick the night(s) you'll eat them</span></span>
                  <button class="switch" role="switch" aria-checked={row.makes_leftovers ? 'true' : 'false'} aria-label="Make leftovers"
                    onClick={() => run(async () => { if (row.makes_leftovers) await setLeftoverNights(household.id, row, [], plan); await updateNight(row, { makes_leftovers: !row.makes_leftovers }); })} />
                </div>
                {row.makes_leftovers && (
                  <div style="padding-left:34px;display:flex;flex-direction:column;gap:6px">
                    <div role="group" aria-label="Leftovers nights" style="display:flex;gap:6px">
                      {later.map((iso) => {
                        const on = mine.includes(iso);
                        const blocked = why(iso);
                        return (
                          <button class="chipbtn butter" style="flex:1;padding:0;height:44px" aria-pressed={on ? 'true' : 'false'} disabled={!!blocked} title={blocked || ''}
                            onClick={() => run(() => setLeftoverNights(household.id, row, on ? mine.filter((x) => x !== iso) : [...mine, iso], plan))}>
                            {on ? '✓ ' : ''}{DAY[fromIso(iso).getDay()]}
                          </button>
                        );
                      })}
                    </div>
                    <span class="cap">Nights already planned, locked or out are greyed out.</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div style="display:flex;gap:8px;align-items:center">
            {row && <button class="link" onClick={() => run(() => clearNight(row), 'Night cleared').then(onClose)}>Clear this night</button>}
            <button class="btn" style="margin-left:auto;min-width:120px" onClick={onClose}>Done</button>
          </div>
        </section>
      )}
    </div>
  );
}
