// Data access shared by screens: recipes cache, photos, helpers.
import { useEffect, useState } from 'preact/hooks';
import { supabase } from './supabase.js';
import { parseNumber } from './parse.js';

// ---------- recipes store (module-level cache + subscribers) ----------
let recipes = null;
let loading = null;
const subs = new Set();
const emit = () => subs.forEach((fn) => fn(recipes));

export async function refreshRecipes() {
  loading = supabase
    .from('recipes')
    .select('*, ingredients(id, position, quantity, unit, name, note)')
    .order('title')
    .then(({ data, error }) => {
      loading = null;
      if (error) throw error;
      recipes = data.map((r) => ({ ...r, ingredients: (r.ingredients || []).sort((a, b) => a.position - b.position) }));
      emit();
      return recipes;
    });
  return loading;
}

export function useRecipes() {
  const [list, setList] = useState(recipes);
  useEffect(() => {
    subs.add(setList);
    if (!recipes && !loading) refreshRecipes().catch(() => {});
    return () => subs.delete(setList);
  }, []);
  return list;
}

export const recipeById = (id) => (recipes || []).find((r) => r.id === id) || null;
export function clearRecipeCache() { recipes = null; }

export async function saveRecipe(recipe, lines, householdId) {
  const row = {
    household_id: householdId,
    title: recipe.title.trim(),
    servings: recipe.servings || 4,
    method: recipe.method,
    seasons: recipe.seasons?.length ? recipe.seasons : ['all'],
    protein: recipe.protein || null,
    easy_fun: !!recipe.easy_fun,
    makes_leftovers: !!recipe.makes_leftovers,
    measure_system: recipe.measure_system || 'AU',
    meal_type: recipe.meal_type || 'dinner',
    source_url: recipe.source_url || null,
    source_note: recipe.source_note || null
  };
  let id = recipe.id;
  if (id) {
    const { error } = await supabase.from('recipes').update(row).eq('id', id);
    if (error) throw error;
    const del = await supabase.from('ingredients').delete().eq('recipe_id', id);
    if (del.error) throw del.error;
  } else {
    const { data, error } = await supabase.from('recipes').insert(row).select('id').single();
    if (error) throw error;
    id = data.id;
  }
  const ing = lines
    .filter((l) => (l.name || '').trim())
    .map((l, i) => ({
      recipe_id: id,
      household_id: householdId,
      position: i,
      quantity: typeof l.quantity === 'number' ? l.quantity : parseNumber(String(l.quantity ?? '')),
      unit: (l.unit || '').trim() || null,
      name: l.name.trim(),
      note: (l.note || '').trim() || null
    }));
  if (ing.length) {
    const { error } = await supabase.from('ingredients').insert(ing);
    if (error) throw error;
  }
  await refreshRecipes();
  return id;
}

export async function deleteRecipe(recipe) {
  const { error } = await supabase.from('recipes').delete().eq('id', recipe.id);
  if (error) throw error;
  if (recipe.photo_path) await supabase.storage.from('recipe-photos').remove([recipe.photo_path]);
  await refreshRecipes();
}

// ---------- photos ----------
// Shrink to about 1200 px on the long side, WebP, before uploading.
export async function resizePhoto(file, max = 1200) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = canvas.toDataURL('image/webp').startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, 0.82));
}

export async function setRecipePhoto(recipe, file, householdId) {
  const blob = await resizePhoto(file);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${householdId}/${recipe.id}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from('recipe-photos').upload(path, blob, { contentType: blob.type, upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from('recipes').update({ photo_path: path }).eq('id', recipe.id);
  if (error) throw error;
  if (recipe.photo_path) await supabase.storage.from('recipe-photos').remove([recipe.photo_path]);
  await refreshRecipes();
}

const urlCache = new Map(); // path → { url, until }
export async function photoUrls(paths) {
  const now = Date.now();
  const need = [...new Set(paths.filter(Boolean))].filter((p) => !(urlCache.get(p)?.until > now));
  if (need.length) {
    const { data } = await supabase.storage.from('recipe-photos').createSignedUrls(need, 60 * 60 * 6);
    (data || []).forEach((d) => d.signedUrl && urlCache.set(d.path, { url: d.signedUrl, until: now + 1000 * 60 * 60 * 5 }));
  }
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, urlCache.get(p)?.url]));
}

export function usePhotoUrls(paths) {
  const key = paths.filter(Boolean).sort().join('|');
  const [urls, setUrls] = useState({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    photoUrls(key.split('|')).then((u) => live && setUrls(u)).catch(() => {});
    return () => { live = false; };
  }, [key]);
  return urls;
}

// ---------- seasons ----------
export const SEASON_LIST = [['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter'], ['spring', 'Spring'], ['all', 'All year']];
export const PROTEINS = [['beef', 'Beef'], ['chicken', 'Chicken'], ['lamb', 'Lamb'], ['pork', 'Pork'], ['fish', 'Fish & seafood'], ['vegetarian', 'Vegetarian']];
export const PROTEIN_LABEL = Object.fromEntries(PROTEINS);
export const MEAL_TYPES = [['dinner', 'Dinner'], ['baking', 'Baking'], ['breakfast', 'Breakfast'], ['snack', 'Snack'], ['dessert', 'Dessert'], ['side', 'Side']];
export const MEAL_TYPE_LABEL = Object.fromEntries(MEAL_TYPES);
export const isDinner = (r) => !r.meal_type || r.meal_type === 'dinner';
// What the weekly non-dinner list is called in the app. Change here to rename it everywhere.
export const EXTRAS_NAME = 'Bake & prep';
export function seasonNow(d = new Date()) {
  const m = d.getMonth(); // southern hemisphere
  return m === 11 || m <= 1 ? 'summer' : m <= 4 ? 'autumn' : m <= 7 ? 'winter' : 'spring';
}
export const inSeason = (r, season = seasonNow()) => !r.seasons?.length || r.seasons.includes('all') || r.seasons.includes(season);
export function seasonsText(seasons) {
  if (!seasons?.length || seasons.includes('all')) return 'All year';
  return SEASON_LIST.filter(([v]) => seasons.includes(v)).map(([, l]) => l).join(' · ');
}

// Local date as YYYY-MM-DD (not UTC).
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fromIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
