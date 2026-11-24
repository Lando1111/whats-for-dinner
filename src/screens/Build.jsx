import { useEffect, useMemo, useState } from 'preact/hooks';
import { friendly } from '../lib/supabase.js';
import { useRecipes, isoDate, fromIso, EXTRAS_NAME } from '../lib/data.js';
import { loadPlan, loadExtras, weekDatesFrom } from '../lib/plan.js';
import { go, back } from '../lib/router.js';
import { ShopChecklist } from './ShopChecklist.jsx';
import { Icon } from '../icons.jsx';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Build({ start, household, say, userId }) {
  const recipes = useRecipes();
  const [plan, setPlan] = useState(null);
  const [extras, setExtras] = useState([]);
  const dates = weekDatesFrom(start ? fromIso(start) : new Date());
  const today = isoDate(new Date());

  useEffect(() => {
    loadPlan(dates[0], dates[6]).then(setPlan).catch((e) => say(friendly(e), true));
    loadExtras(dates[0]).then(setExtras).catch(() => {});
  }, [dates[0]]);

  const cookNights = (plan || []).filter((p) => p.kind === 'cook' && p.date >= today && p.recipe_id);
  const sources = useMemo(() => [
    ...cookNights.map((n) => ({ recipe_id: n.recipe_id, multiplier: n.multiplier })),
    ...extras.map((x) => ({ recipe_id: x.recipe_id, multiplier: x.multiplier }))
  ], [plan, extras]);
  const title = (id) => recipes?.find((r) => r.id === id)?.title;

  return (
    <main class="main no-tabs">
      <header class="row-head" style="gap:4px">
        <button class="icon-btn" aria-label="Back" style="margin-left:-10px" onClick={() => back('week')}><Icon name="back" /></button>
        <h1 class="title">Build shopping list</h1>
      </header>
      <p style="margin:0;font-size:15px;line-height:22px">Tick what you're <strong>missing</strong>. Everything else you've already got.</p>
      {plan && (
        <p class="cap" style="margin:0">
          Dinners: {cookNights.map((n) => `${DAY[fromIso(n.date).getDay()]}${n.multiplier === 2 ? ' ×2' : ''}`).join(', ') || 'none planned yet'}.
          {extras.length ? ` ${EXTRAS_NAME}: ${extras.map((x) => `${title(x.recipe_id) || 'recipe'}${x.multiplier === 2 ? ' ×2' : ''}`).join(', ')}.` : ''} Leftovers and nights out need nothing.
        </p>
      )}
      {!plan || !recipes ? <p class="cap">Loading…</p> : sources.length === 0 ? (
        <div class="empty"><p style="margin:0;font-weight:700">Nothing to build from</p><p class="cap" style="margin:0">Plan some dinners or extras for this week first.</p><a class="btn" href="#/week">Back to the week</a></div>
      ) : (
        <ShopChecklist sources={sources} household={household} userId={userId} say={say} onDone={() => go('shopping')} />
      )}
    </main>
  );
}
