import { useEffect, useRef, useState } from 'preact/hooks';
import { useRecipes, usePhotoUrls, setRecipePhoto, seasonsText, PROTEIN_LABEL, MEAL_TYPE_LABEL, isDinner, EXTRAS_NAME, isoDate } from '../lib/data.js';
import { convertLine, formatAmount, formatOriginal, fahrenheitToCelsius } from '../lib/units.js';
import { loadPlan, planRecipe, addExtra, mondayOf } from '../lib/plan.js';
import { ShopChecklist } from './ShopChecklist.jsx';
import { friendly } from '../lib/supabase.js';
import { go, back } from '../lib/router.js';
import { Icon } from '../icons.jsx';

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SYSTEM_TEXT = { AU: 'Australian measures', US: 'US measures', UK: 'UK measures', metric: 'metric measures' };

export function Recipe({ id, household, canEdit, say, userId }) {
  const recipes = useRecipes();
  const recipe = recipes?.find((r) => r.id === id);
  const [doubled, setDoubled] = useState(false);
  const [original, setOriginal] = useState(false);
  const [showMethod, setShowMethod] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();
  const urls = usePhotoUrls([recipe?.photo_path]);

  if (recipes === null) return <main class="main no-tabs"><p class="cap">Loading…</p></main>;
  if (!recipe) return <main class="main no-tabs"><p>That recipe isn't here any more.</p><a class="btn" href="#/recipes">Back to recipes</a></main>;

  const mult = doubled ? 2 : 1;
  const prefs = household.settings?.unit_prefs || {};
  const system = recipe.measure_system || 'AU';

  async function onPhoto(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setUploading(true);
    try { await setRecipePhoto(recipe, file, household.id); say('Photo saved'); } catch (err) { say(friendly(err), true); }
    setUploading(false);
  }

  const photo = recipe.photo_path && urls[recipe.photo_path];
  return (
    <main class="main no-tabs" style="padding-top:0;padding-left:0;padding-right:0;gap:0">
      <div style={`position:relative;height:${photo ? 240 : 120}px;background:var(--duck);flex:none`}>
        {photo && <img src={photo} alt={recipe.title} style="width:100%;height:240px;object-fit:cover;display:block" />}
        <button class="icon-btn float" aria-label="Back" style="left:12px" onClick={() => back('recipes')}><Icon name="back" /></button>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept="image/*" class="sr" onChange={onPhoto} aria-label="Choose a photo" />
            <button class="btn outline float" style="right:12px;height:44px;font-size:14px;padding:0 14px;border:0" disabled={uploading} onClick={() => fileRef.current.click()}>
              <Icon name="camera" size={20} />{uploading ? 'Saving…' : photo ? 'Change photo' : 'Add a photo'}
            </button>
          </>
        )}
      </div>

      <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
        <h1 style="margin:0;font:600 26px/32px var(--display)">{recipe.title}</h1>
        <div style="display:flex;align-items:center;gap:12px">
          <p class="cap" style="margin:0"><strong style="color:var(--ink);font-size:15px">Serves {recipe.servings * mult}{doubled ? ' (doubled)' : ''}</strong>{recipe.source_note ? ` · ${recipe.source_note}` : ''}</p>
          <button class="x2" aria-pressed={doubled ? 'true' : 'false'} aria-label="Double the recipe" onClick={() => setDoubled(!doubled)}>{doubled ? '×2 on' : '×2'}</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          {!isDinner(recipe) && <span class="chip big" style="background:var(--apricot);color:var(--on-ap)">{MEAL_TYPE_LABEL[recipe.meal_type]}</span>}
          {recipe.protein && <span class="chip big" style="background:var(--sage)">{PROTEIN_LABEL[recipe.protein]}</span>}
          {recipe.makes_leftovers && <span class="chip big" style="background:var(--butter)">Makes leftovers</span>}
          {recipe.easy_fun && <span class="chip big" style="background:var(--butter)">Easy / fun</span>}
          <span class="chip big" style="background:var(--duck)">{seasonsText(recipe.seasons)}</span>
        </div>
        {recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noopener" style="font-size:14px;overflow-wrap:anywhere">{recipe.source_url}</a>}

        <div style="display:flex;align-items:center;min-height:44px;margin-top:4px">
          <h2 style="margin:0;font-size:18px;line-height:24px">Ingredients</h2>
          <div class="seg" role="group" aria-label="Units" style="margin-left:auto">
            <button aria-pressed={!original ? 'true' : 'false'} onClick={() => setOriginal(false)}>Converted</button>
            <button aria-pressed={original ? 'true' : 'false'} onClick={() => setOriginal(true)}>Original</button>
          </div>
        </div>
        {system !== 'AU' && !original && <span class="cap" style="margin-top:-8px">Converted from {SYSTEM_TEXT[system]} to your units.</span>}
        <ul class="ing">
          {recipe.ingredients.map((line) => {
            const conv = convertLine(line, { system, prefs, multiplier: mult });
            const amount = original ? formatOriginal(line, mult, system) : formatAmount(conv);
            const orig = !original && conv.converted ? formatOriginal(line, mult, system) : '';
            return (
              <li>
                <span class="amt">{amount}</span>
                <span>{line.name}{line.note ? <span class="cap">, {line.note}</span> : null}{orig ? <span class="cap"> ({orig})</span> : null}</span>
              </li>
            );
          })}
          {recipe.ingredients.length === 0 && <li class="cap">No ingredients yet.</li>}
        </ul>
        {recipe.ingredients.length > 0 && (
          <button class="btn outline block" style="height:48px;font-size:15px" onClick={() => setShopping(true)}><Icon name="cart" size={20} />Add ingredients to shopping list{doubled ? ' (×2)' : ''}</button>
        )}

        {recipe.method.length > 0 && (
          <section>
            <button class="method-head" aria-expanded={showMethod ? 'true' : 'false'} onClick={() => setShowMethod(!showMethod)}>
              <span style="font-size:18px;font-weight:700">Method</span><span class="cap">{recipe.method.length} steps</span>
              <span style={`margin-left:auto;transform:rotate(${showMethod ? 180 : 0}deg)`}><Icon name="down" /></span>
            </button>
            {showMethod && (
              <ol class="steps">{recipe.method.map((s) => <li>{system === 'US' ? fahrenheitToCelsius(s) : s}</li>)}</ol>
            )}
          </section>
        )}
      </div>

      {canEdit && (
        <div class="footer-bar">
          <a class="icon-btn" href={`#/recipe/${recipe.id}/edit`} aria-label="Edit recipe" style="border:2px solid var(--ls);width:52px;height:52px"><Icon name="edit" /></a>
          <button class="btn" style="flex:1" onClick={() => setPlanning(true)}><Icon name="week" />{isDinner(recipe) ? 'Add to the week' : `Add to ${EXTRAS_NAME}`}</button>
        </div>
      )}
      {planning && <PlanSheet recipe={recipe} household={household} doubled={doubled} say={say} onClose={() => setPlanning(false)} />}
      {shopping && (
        <div class="scrim" onClick={(e) => e.target === e.currentTarget && setShopping(false)}>
          <section class="sheet" role="dialog" aria-label="Add ingredients to shopping list">
            <div class="handle" />
            <div class="row-head"><h2 style="margin:0;font:600 22px/28px var(--display)">What are you missing?</h2><button class="icon-btn" style="margin-left:auto" aria-label="Close" onClick={() => setShopping(false)}><Icon name="close" /></button></div>
            <span class="cap">{recipe.title}{doubled ? ' · doubled (×2)' : ''}. Tick what you need to buy.</span>
            <ShopChecklist sources={[{ recipe_id: recipe.id, multiplier: mult }]} household={household} userId={userId} say={say} sticky={false} onDone={() => setShopping(false)} />
          </section>
        </div>
      )}
    </main>
  );
}

function PlanSheet({ recipe, household, doubled, say, onClose }) {
  const [plan, setPlan] = useState(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
  const from = isoDate(days[0]); const to = isoDate(days[13]);
  const recipes = useRecipes() || [];
  const nameOf = (rid) => recipes.find((r) => r.id === rid)?.title || 'a recipe';

  useEffect(() => { loadPlan(from, to).then(setPlan).catch((e) => say(friendly(e), true)); }, [from, to]);

  async function addAsExtra(weeksAhead) {
    const monday = mondayOf(); monday.setDate(monday.getDate() + weeksAhead * 7);
    try {
      await addExtra(household.id, isoDate(monday), recipe.id, doubled ? 2 : 1);
      say(`${recipe.title} added to ${weeksAhead ? "next week's" : "this week's"} bake & prep`);
      onClose();
      go(weeksAhead ? 'week' : 'week');
    } catch (e) { say(friendly(e), true); }
  }

  const extrasBlock = (
    <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:8px">
      <span style="font-weight:700">Bake &amp; prep</span>
      <span class="cap">For baking, overnight oats and other non-dinners. Doesn't use a dinner night; its ingredients go into Build list.</span>
      <div class="grid2" style="gap:8px">
        <button class="btn outline" style="height:44px;font-size:14px" onClick={() => addAsExtra(0)}>This week</button>
        <button class="btn outline" style="height:44px;font-size:14px" onClick={() => addAsExtra(1)}>Next week</button>
      </div>
    </div>
  );

  async function choose(d) {
    const date = isoDate(d);
    const existing = plan.find((p) => p.date === date);
    if (existing?.locked) return say('That night is locked. Unlock it on the Week screen first.', true);
    if (existing && !window.confirm(`Replace what's planned for ${DAY[d.getDay()]} ${d.getDate()}?`)) return;
    try {
      await planRecipe(household.id, date, recipe, { multiplier: doubled ? 2 : 1, existing: existing?.kind === 'cook' ? existing : null });
      say(`${recipe.title} planned for ${DAY[d.getDay()]} ${d.getDate()}`);
      onClose();
      go('week');
    } catch (e) { say(friendly(e), true); }
  }

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="sheet" role="dialog" aria-label="Plan for a night">
        <div class="handle" />
        <div class="row-head"><h2 style="margin:0;font:600 22px/28px var(--display)">Add to the week</h2><button class="icon-btn" style="margin-left:auto" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
        {doubled && <span class="cap">It'll be added doubled (×2).</span>}
        {!isDinner(recipe) && extrasBlock}
        <span style="font-weight:700">{isDinner(recipe) ? 'As dinner on a night' : 'Or as dinner on a night'}</span>
        {!plan ? <p class="cap">Loading…</p> : (
          <div style="display:flex;flex-direction:column;overflow-y:auto">
            {days.map((d, i) => {
              const p = plan.find((x) => x.date === isoDate(d));
              const what = !p ? 'Free' : p.kind === 'out' ? `Out${p.note ? ` · ${p.note}` : ''}` : p.kind === 'leftovers' ? `Leftovers: ${nameOf(p.recipe_id)}` : nameOf(p.recipe_id);
              return (
                <button class="listrow" style="min-height:56px" onClick={() => choose(d)}>
                  <span style="width:72px;font-weight:700;text-align:left">{i === 0 ? 'Tonight' : `${DAY[d.getDay()]} ${d.getDate()}`}</span>
                  <span class={p ? '' : 'cap'} style="text-align:left">{what}{p?.locked ? ' · locked' : ''}</span>
                </button>
              );
            })}
          </div>
        )}
        {isDinner(recipe) && extrasBlock}
      </section>
    </div>
  );
}
