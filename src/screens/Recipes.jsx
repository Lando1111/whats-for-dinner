import { useMemo, useState } from 'preact/hooks';
import { useRecipes, usePhotoUrls, inSeason, seasonNow, PROTEIN_LABEL } from '../lib/data.js';
import { Icon } from '../icons.jsx';

const FILTERS = [
  ['all', 'All'],
  ['season', 'In season'],
  ['vegetarian', 'Vegetarian'],
  ['easy', 'Easy / fun'],
  ['leftovers', 'Leftovers']
];

export function Recipes({ canEdit, pick, onPick }) {
  const recipes = useRecipes();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const season = seasonNow();

  const shown = useMemo(() => {
    if (!recipes) return [];
    const needle = q.trim().toLowerCase();
    return recipes.filter((r) => {
      if (filter === 'season' && !inSeason(r, season)) return false;
      if (filter === 'vegetarian' && r.protein !== 'vegetarian') return false;
      if (filter === 'easy' && !r.easy_fun) return false;
      if (filter === 'leftovers' && !r.makes_leftovers) return false;
      if (!needle) return true;
      return r.title.toLowerCase().includes(needle) || r.ingredients.some((i) => i.name.toLowerCase().includes(needle));
    });
  }, [recipes, q, filter, season]);

  const urls = usePhotoUrls(shown.map((r) => r.photo_path));

  return (
    <main class="main" style={pick ? 'padding-bottom:24px' : ''}>
      <header class="row-head">
        {pick && <button class="icon-btn" aria-label="Close" style="margin-left:-10px" onClick={() => onPick(null)}><Icon name="close" /></button>}
        <h1 class="title">{pick ? 'Pick a recipe' : 'Recipes'}</h1>
        {!pick && canEdit && <a class="btn" href="#/recipe/new" style="margin-left:auto;height:44px;padding:0 16px;font-size:15px"><Icon name="plus" size={20} stroke={2.4} />Add recipe</a>}
      </header>

      <div style="position:relative">
        <label class="sr" for="rq">Search recipes</label>
        <span style="position:absolute;left:14px;top:14px;color:var(--muted)"><Icon name="search" size={20} /></span>
        <input id="rq" class="field" style="padding-left:42px" placeholder="Search recipes or ingredients" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>

      <div role="group" aria-label="Filters" style="display:flex;gap:8px;overflow-x:auto;margin:0 -16px;padding:0 16px 2px">
        {FILTERS.map(([v, l]) => (
          <button class="chipbtn" aria-pressed={filter === v ? 'true' : 'false'} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>

      {recipes === null ? <p class="cap">Loading recipes…</p> : recipes.length === 0 ? (
        <div class="empty">
          <img src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" />
          <p style="margin:0;font-weight:700">No recipes yet</p>
          <p class="cap" style="margin:0;max-width:280px">Add your family's favourites. You can paste a whole ingredient list and the app will sort it out.</p>
          {canEdit && <a class="btn" href="#/recipe/new">Add your first recipe</a>}
        </div>
      ) : (
        <>
          <span class="cap">{shown.length} {shown.length === 1 ? 'recipe' : 'recipes'}{filter === 'season' ? ` · in season now (${season})` : ''}</span>
          <div>
            {shown.map((r) => {
              const body = (
                <>
                  {r.photo_path && urls[r.photo_path]
                    ? <img class="thumb" src={urls[r.photo_path]} alt="" loading="lazy" />
                    : <span class="thumb" style="background:var(--duck);display:flex;align-items:center;justify-content:center"><Icon name="camera" size={24} stroke={1.8} /></span>}
                  <span style="display:flex;flex-direction:column;gap:4px;min-width:0;text-align:left">
                    <span style="font-weight:700;line-height:20px">{r.title}</span>
                    <span style="display:flex;gap:6px;flex-wrap:wrap">
                      {r.protein && <span class="chip" style="background:var(--sage)">{PROTEIN_LABEL[r.protein]}</span>}
                      {r.easy_fun && <span class="chip" style="background:var(--butter)">Easy / fun</span>}
                      {r.makes_leftovers && <span class="chip" style="background:var(--butter)">Leftovers</span>}
                      {!r.photo_path && <span class="cap" style="line-height:22px">No photo yet</span>}
                    </span>
                  </span>
                </>
              );
              return pick
                ? <button class="listrow" onClick={() => onPick(r)}>{body}</button>
                : <a class="listrow" href={`#/recipe/${r.id}`}>{body}</a>;
            })}
            {shown.length === 0 && <p class="cap" style="text-align:center;padding:24px 0">Nothing matches. Try another search or filter.</p>}
          </div>
        </>
      )}
    </main>
  );
}
