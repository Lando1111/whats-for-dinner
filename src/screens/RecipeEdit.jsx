import { useEffect, useRef, useState } from 'preact/hooks';
import { useRecipes, saveRecipe, deleteRecipe, setRecipePhoto, SEASON_LIST, PROTEINS, MEAL_TYPES, EXTRAS_NAME } from '../lib/data.js';
import { parseIngredients, parseMethod, splitRecipeText, guessProtein } from '../lib/parse.js';
import { formatQty } from '../lib/units.js';
import { supabase, friendly } from '../lib/supabase.js';
import { go, back } from '../lib/router.js';
import { Icon } from '../icons.jsx';
import { PhotoImport } from './PhotoImport.jsx';

const blankLine = () => ({ quantity: '', unit: '', name: '', note: '', ok: true });
const qtyText = (q) => (q == null || q === '' ? '' : typeof q === 'number' ? formatQty(q) : q);

export function RecipeEdit({ id, household, say }) {
  const recipes = useRecipes();
  const existing = id && id !== 'new' ? recipes?.find((r) => r.id === id) : null;
  if (id !== 'new' && recipes === null) return <main class="main no-tabs"><p class="cap">Loading…</p></main>;
  if (id !== 'new' && !existing) return <main class="main no-tabs"><p>That recipe isn't here any more.</p></main>;
  return <Form key={id} existing={existing} household={household} say={say} />;
}

function Form({ existing, household, say }) {
  const [r, setR] = useState(() => ({
    title: existing?.title || '',
    servings: existing?.servings || 4,
    measure_system: existing?.measure_system || 'AU',
    meal_type: existing?.meal_type || 'dinner',
    protein: existing?.protein || null,
    seasons: existing?.seasons || ['all'],
    easy_fun: existing?.easy_fun || false,
    makes_leftovers: existing?.makes_leftovers || false,
    source_note: existing?.source_note || '',
    source_url: existing?.source_url || ''
  }));
  const [lines, setLines] = useState(() => existing?.ingredients?.length
    ? existing.ingredients.map((i) => ({ ...i, quantity: qtyText(i.quantity), unit: i.unit || '', note: i.note || '', ok: true }))
    : [blankLine()]);
  const [method, setMethod] = useState((existing?.method || []).join('\n'));
  const [paste, setPaste] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const pageRef = useRef();
  const [pageFile, setPageFile] = useState(null);
  const [previews, setPreviews] = useState(null);

  async function importLink(url) {
    setImporting(true);
    const { data, error } = await supabase.functions.invoke('import-recipe', { body: { url } });
    setImporting(false);
    if (error) {
      let msg = "Couldn't import that page. Try copying the recipe text and using Paste a list.";
      try { const b = await error.context?.json(); if (b?.error) msg = b.error; } catch { /* keep default */ }
      return say(msg, true);
    }
    const parsed = parseIngredients((data.ingredients || []).join('\n')).map((p) => ({ ...p, quantity: qtyText(p.quantity), unit: p.unit || '', note: p.note || '' }));
    const text = (data.ingredients || []).join(' ');
    const measure = /\.au$/.test(data.site) ? 'AU' : /\.uk$/.test(data.site) ? 'UK' : /\b(cups?|tbsp|tsp|oz|lbs?|tablespoons?|teaspoons?)\b/i.test(text) ? 'US' : 'metric';
    setR((cur) => ({ ...cur, protein: cur.protein || (parsed.length ? guessProtein(parsed.map((x) => x.name)) : null), title: data.title || cur.title, servings: data.servings || cur.servings, source_url: data.source_url, source_note: data.site, measure_system: measure }));
    if (parsed.length) setLines(parsed);
    if (data.method?.length) setMethod(data.method.join('\n'));
    if (data.image?.data) {
      const bytes = Uint8Array.from(atob(data.image.data), (c) => c.charCodeAt(0));
      setPhoto(new File([bytes], 'from-website', { type: data.image.type }));
    }
    setLink('');
    const flagged = parsed.filter((p) => !p.ok).length;
    say(`Imported from ${data.site}. Check the measurements${flagged ? ` and the ${flagged} highlighted lines` : ''}, then save.`);
  }

  function applyPhoto(res) {
    setPageFile(null);
    const parsed = parseIngredients(res.ingredients.join('\n')).map((p) => ({ ...p, quantity: qtyText(p.quantity), unit: p.unit || '', note: p.note || '' }));
    const keep = lines.filter((l) => l.name.trim());
    if (parsed.length) setLines([...keep, ...parsed]);
    if (res.method.length) setMethod((m) => [m.trim(), ...res.method].filter(Boolean).join('\n'));
    setR((cur) => ({
      ...cur,
      title: cur.title || res.title,
      servings: res.servings || cur.servings,
      measure_system: res.system,
      protein: cur.protein || (parsed.length ? guessProtein([...keep, ...parsed].map((x) => x.name)) : null)
    }));
    if (res.dish) setPhoto(new File([res.dish], 'from-page.jpg', { type: 'image/jpeg' }));
    setPreviews(res.previews);
    const flagged = parsed.filter((p) => !p.ok).length;
    say(parsed.length
      ? `Read ${parsed.length} ingredients${res.method.length ? ` and ${res.method.length} steps` : ''}. Check them against the photo${flagged ? `, especially the ${flagged} highlighted` : ''}.`
      : "Couldn't find ingredients in that box. Try again with the page flatter, or type them in.", !parsed.length);
  }

  useEffect(() => {
    let shared = null;
    try { shared = sessionStorage.getItem('wfd-share'); sessionStorage.removeItem('wfd-share'); } catch { /* ignore */ }
    if (shared && !existing) importLink(shared);
  }, []);

  const set = (k, v) => setR({ ...r, [k]: v });
  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v, ok: true } : l)));

  function toggleSeason(s) {
    if (s === 'all') return set('seasons', ['all']);
    const cur = r.seasons.filter((x) => x !== 'all');
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    set('seasons', next.length ? next : ['all']);
  }

  function applyPaste() {
    const split = splitRecipeText(paste);
    const parsed = parseIngredients(split ? split.ingredients : paste).map((p) => ({ ...p, quantity: qtyText(p.quantity), unit: p.unit || '', note: p.note || '' }));
    const keep = lines.filter((l) => l.name.trim());
    setLines([...keep, ...parsed]);
    if (!r.protein && parsed.length) set('protein', guessProtein([...keep, ...parsed].map((x) => x.name)));
    if (split && !method.trim()) setMethod(parseMethod(split.method).join('\n'));
    if (/\b(cups?|tbsp|tsp)\b/i.test(paste) && /\b(oz|lb|°F)\b/.test(paste)) set('measure_system', 'US');
    setPaste(null);
    const flagged = parsed.filter((p) => !p.ok).length;
    say(flagged ? `${parsed.length} lines added. Check the ${flagged} highlighted.` : `${parsed.length} lines added`);
  }

  async function save(e) {
    e.preventDefault();
    if (!r.title.trim()) return say('Give the recipe a name first.', true);
    setBusy(true);
    try {
      const id = await saveRecipe({ ...r, id: existing?.id, method: parseMethod(method) }, lines, household.id);
      if (photo) {
        const fresh = { id, photo_path: existing?.photo_path || null };
        await setRecipePhoto(fresh, photo, household.id);
      }
      say('Recipe saved');
      go(`recipe/${id}`);
    } catch (err) { say(friendly(err), true); }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm(`Delete ${existing.title}? This can't be undone.`)) return;
    try { await deleteRecipe(existing); say('Recipe deleted'); go('recipes'); } catch (err) { say(friendly(err), true); }
  }

  return (
    <main class="main no-tabs">
      <header class="row-head" style="gap:4px">
        <button class="icon-btn" aria-label="Cancel" style="margin-left:-10px" onClick={() => back(existing ? `recipe/${existing.id}` : 'recipes')}><Icon name="close" /></button>
        <h1 class="title">{existing ? 'Edit recipe' : 'New recipe'}</h1>
      </header>

      {!existing && (
        <form onSubmit={(e) => { e.preventDefault(); if (link.trim()) importLink(link.trim()); }} class="card" style="padding:12px;display:flex;flex-direction:column;gap:8px">
          <label class="lbl" for="link" style="margin:0">Import from a website</label>
          <div style="display:flex;gap:8px">
            <input id="link" class="field" type="url" inputmode="url" placeholder="Paste a recipe link" value={link} onInput={(e) => setLink(e.currentTarget.value)} />
            <button class="btn outline" style="height:48px;padding:0 14px" disabled={!link.trim() || importing}>{importing ? 'Reading…' : 'Import'}</button>
          </div>
          <span class="cap">{importing ? 'Reading the recipe from the website…' : 'Tip: on a recipe website, tap Share → What\'s for Dinner? to do this in one step.'}</span>
          <input ref={pageRef} type="file" accept="image/*" class="sr" aria-label="Choose a photo of a recipe" onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) setPageFile(f); }} />
          <button type="button" class="btn outline" style="height:48px" onClick={() => pageRef.current.click()}><Icon name="camera" size={20} />Read a recipe from a photo</button>
          <span class="cap">From a cookbook or recipe card. The text is read on this phone.</span>
        </form>
      )}
      {pageFile && <PhotoImport file={pageFile} onDone={applyPhoto} onCancel={() => setPageFile(null)} />}

      <form id="rf" onSubmit={save} style="display:flex;flex-direction:column;gap:16px">
        <div>
          <label class="lbl" for="t">Name</label>
          <input id="t" class="field" required maxLength={120} value={r.title} onInput={(e) => set('title', e.currentTarget.value)} placeholder="e.g. Beef & bean chilli" />
        </div>

        <div class="row-head" style="gap:12px">
          <input ref={fileRef} type="file" accept="image/*" class="sr" aria-label="Choose a photo" onChange={(e) => { setPhoto(e.currentTarget.files?.[0] || null); }} />
          <button type="button" class="btn outline" style="height:44px;font-size:14px" onClick={() => fileRef.current.click()}><Icon name="camera" size={20} />{photo ? 'Change photo' : existing?.photo_path ? 'Change photo' : 'Add a photo'}</button>
          <span class="cap">{photo ? (photo.name === 'from-website' ? "Using the website's photo" : photo.name === 'from-page.jpg' ? 'Using the picture from the page' : 'Photo chosen') : 'Optional. Take one or pick from your gallery.'}</span>
        </div>

        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div>
            <span class="lbl" style="display:block">Serves</span>
            <span style="display:flex;align-items:center;gap:8px">
              <button type="button" class="icon-btn" style="border:2px solid var(--ls)" aria-label="Fewer serves" onClick={() => set('servings', Math.max(1, r.servings - 1))}>−</button>
              <span style="min-width:28px;text-align:center;font-weight:700">{r.servings}</span>
              <button type="button" class="icon-btn" style="border:2px solid var(--ls)" aria-label="More serves" onClick={() => set('servings', Math.min(50, r.servings + 1))}>+</button>
            </span>
          </div>
          <div style="flex:1;min-width:220px">
            <span class="lbl" style="display:block">Measurements in the source</span>
            <div class="seg" role="group" aria-label="Measurements in the source">
              {[['AU', 'Australian'], ['US', 'US'], ['UK', 'UK'], ['metric', 'Metric']].map(([v, l]) => (
                <button type="button" aria-pressed={r.measure_system === v ? 'true' : 'false'} onClick={() => set('measure_system', v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        <section>
          <div class="row-head" style="justify-content:space-between">
            <h2 class="lbl" style="margin:0">Ingredients</h2>
            <button type="button" class="link" onClick={() => setPaste(paste === null ? '' : null)}>{paste === null ? 'Paste a list' : 'Cancel paste'}</button>
          </div>
          {previews?.ingredients?.length > 0 && (
            <details class="card compare" open>
              <summary>Compare with the photo</summary>
              {previews.ingredients.map((u, i) => <img src={u} alt={`Ingredients from the photo, part ${i + 1}`} />)}
            </details>
          )}
          {paste !== null && (
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
              <label class="sr" for="paste">Paste ingredients</label>
              <textarea id="paste" class="field area" rows={6} value={paste} onInput={(e) => setPaste(e.currentTarget.value)} placeholder={'One per line, e.g.\n500 g beef mince\n1 brown onion, diced\n2 x 400 g tins kidney beans'} />
              <button type="button" class="btn outline" disabled={!paste.trim()} onClick={applyPaste}>Add these lines</button>
            </div>
          )}
          <div style="display:flex;flex-direction:column;gap:6px">
            <div class="ing-row cap" aria-hidden="true"><span>Amount</span><span>Unit</span><span>Ingredient, note</span><span /></div>
            {lines.map((l, i) => (
              <div class={`ing-row${l.ok === false ? ' flag' : ''}`}>
                <input class="field sm" aria-label="Amount" inputmode="decimal" value={l.quantity} onInput={(e) => setLine(i, 'quantity', e.currentTarget.value)} placeholder={l.name ? '' : '1½'} />
                <input class="field sm" aria-label="Unit" value={l.unit} onInput={(e) => setLine(i, 'unit', e.currentTarget.value)} placeholder={l.name ? '' : 'cup'} />
                <input class="field sm" aria-label="Ingredient" value={l.note ? `${l.name}, ${l.note}` : l.name}
                  onInput={(e) => { const v = e.currentTarget.value; const c = v.indexOf(','); setLines(lines.map((x, j) => (j === i ? { ...x, name: c > 0 ? v.slice(0, c).trim() : v, note: c > 0 ? v.slice(c + 1).trim() : '', ok: true } : x))); }}
                  placeholder="plain flour, sifted" />
                <button type="button" class="icon-btn" aria-label="Remove line" onClick={() => setLines(lines.length > 1 ? lines.filter((_, j) => j !== i) : [blankLine()])}><Icon name="close" size={18} /></button>
              </div>
            ))}
            {lines.some((l) => l.ok === false) && <span class="cap" style="color:var(--beet);font-weight:600">Highlighted lines didn't read cleanly. Check the amount and unit.</span>}
            <button type="button" class="link" style="align-self:flex-start;padding:0" onClick={() => setLines([...lines, blankLine()])}>+ Add an ingredient</button>
          </div>
        </section>

        <div>
          <label class="lbl" for="m">Method</label>
          {previews?.method?.length > 0 && (
            <details class="card compare">
              <summary>Compare with the photo</summary>
              {previews.method.map((u, i) => <img src={u} alt={`Method from the photo, part ${i + 1}`} />)}
            </details>
          )}
          <textarea id="m" class="field area" rows={6} value={method} onInput={(e) => setMethod(e.currentTarget.value)} placeholder={'One step per line'} />
        </div>

        <section style="display:flex;flex-direction:column;gap:8px">
          <h2 class="lbl" style="margin:0">Type</h2>
          <div class="chips">
            {MEAL_TYPES.map(([v, l]) => <button type="button" class="chipbtn" aria-pressed={r.meal_type === v ? 'true' : 'false'} onClick={() => set('meal_type', v)}>{l}</button>)}
          </div>
          <span class="cap">Only dinners are used by Fill the week. The rest go in {EXTRAS_NAME}.</span>
          <h2 class="lbl" style="margin:8px 0 0">Protein</h2>
          <div class="chips">
            {PROTEINS.map(([v, l]) => <button type="button" class="chipbtn sage" aria-pressed={r.protein === v ? 'true' : 'false'} onClick={() => set('protein', r.protein === v ? null : v)}>{l}</button>)}
          </div>
          <h2 class="lbl" style="margin:8px 0 0">Season</h2>
          <div class="chips">
            {SEASON_LIST.map(([v, l]) => <button type="button" class="chipbtn duck" aria-pressed={r.seasons.includes(v) ? 'true' : 'false'} onClick={() => toggleSeason(v)}>{l}</button>)}
          </div>
          <h2 class="lbl" style="margin:8px 0 0">Good for</h2>
          <div class="chips">
            <button type="button" class="chipbtn butter" aria-pressed={r.easy_fun ? 'true' : 'false'} onClick={() => set('easy_fun', !r.easy_fun)}>Easy / fun</button>
            <button type="button" class="chipbtn butter" aria-pressed={r.makes_leftovers ? 'true' : 'false'} onClick={() => set('makes_leftovers', !r.makes_leftovers)}>Makes leftovers</button>
          </div>
        </section>

        <div>
          <label class="lbl" for="src">Where it's from</label>
          <input id="src" class="field" maxLength={120} value={r.source_note} onInput={(e) => set('source_note', e.currentTarget.value)} placeholder="e.g. Family favourites, p. 42" />
          <input class="field" style="margin-top:8px" type="url" aria-label="Website link" value={r.source_url} onInput={(e) => set('source_url', e.currentTarget.value)} placeholder="Website link (optional)" />
        </div>

        {existing && <button type="button" class="link" style="align-self:center" onClick={remove}><span style="display:inline-flex;align-items:center;gap:6px"><Icon name="trash" size={18} />Delete recipe</span></button>}
      </form>

      <div class="footer-bar">
        <button class="btn block" form="rf" disabled={busy}>{busy ? 'Saving…' : 'Save recipe'}</button>
      </div>
    </main>
  );
}
