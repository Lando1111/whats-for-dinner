// Easter eggs: secret words, special days and times, rare surprises, trophies.
// Everything here runs on the phone; nothing changes household data.

const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const KEY = 'wfd-eggs';
const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

// Settings → Easter eggs (per phone, on by default).
export const eggsOn = () => read(KEY, true) !== false;
export const setEggs = (on) => write(KEY, !!on);

export const isHeadChef = () => !!read('wfd-head-chef', false);
export const setHeadChef = (on) => write('wfd-head-chef', !!on);

// ---- Dates ----

// Easter Sunday (Gregorian, the "anonymous" algorithm).
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const sameDay = (a, b) => isoDate(a) === isoDate(b);

export const shroveTuesday = (year) => addDays(easterSunday(year), -47);

// Good Friday to Easter Monday.
export function isEasterWeekend(d) {
  const sun = easterSunday(d.getFullYear());
  const day = isoDate(d);
  return day >= isoDate(addDays(sun, -2)) && day <= isoDate(addDays(sun, 1));
}

// Which special day (if any) a date is.
export function specialDay(d) {
  const m = d.getMonth() + 1, day = d.getDate();
  if (m === 4 && day === 1) return 'april_fools';
  if (m === 10 && day === 31) return 'halloween';
  if (m === 12 && day >= 24 && day <= 26) return 'christmas';
  if (isEasterWeekend(d)) return 'easter';
  if (sameDay(d, shroveTuesday(d.getFullYear()))) return 'shrove';
  return null;
}

export const isLateNight = (d) => d.getHours() >= 23 || d.getHours() < 4;
export const isUfoHour = (d) => d.getHours() === 2;

export const DEFAULT_TITLE = "What's for Dinner?";

// The Week screen's title for this moment.
export function headerTitle(d) {
  const sd = specialDay(d);
  if (sd === 'april_fools') return "What's for Dessert?";
  if (sd === 'christmas' && d.getDate() === 25) return "What's for Christmas lunch?";
  if (isLateNight(d)) return "What's for… midnight snack?";
  return DEFAULT_TITLE;
}

// What the pizza in the header wears.
export function pizzaHat(d) {
  const sd = specialDay(d);
  if (sd === 'halloween') return 'pumpkin';
  if (d.getMonth() === 11 && d.getDate() <= 25) return 'santa'; // 1–25 December
  if (isLateNight(d)) return 'nightcap';
  return null;
}

// Easter weekend: chocolate eggs hidden on four of the week's tiles (the same four all weekend).
export function easterEggDates(weekDates, year) {
  const picks = [];
  let seed = year * 7 + 3;
  const pool = [...weekDates];
  while (picks.length < 4 && pool.length) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    picks.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return picks;
}

// Same night last year: 52 weeks back, so it's the same day of the week.
export const lastYearIso = (iso) => isoDate(addDays(fromIso(iso), -364));

// Household anniversary: shows for three days from the date it was started, from the first year on.
export function anniversary(createdAt, now) {
  if (!createdAt) return 0;
  const start = new Date(createdAt);
  const years = now.getFullYear() - start.getFullYear();
  if (years < 1) return 0;
  const thisYear = new Date(now.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - thisYear) / 86400000);
  return diff >= 0 && diff < 3 ? years : 0;
}

// ---- Secret words typed into the shopping list ----
const WORDS = { 'make it rain': 'rain', abracadabra: 'shuffle', 'pizza party': 'pizza' };
export function secretWord(text) {
  const t = String(text || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return WORDS[t] || null;
}

// ---- Trophies ----
export const TROPHIES = [
  { id: 'first', name: "Let's eat", how: 'Plan your first dinner' },
  { id: 'full_week', name: 'Full house', how: 'Plan all seven nights of a week' },
  { id: 'streak4', name: 'On a roll', how: 'Plan four full weeks in a row' },
  { id: 'leftovers10', name: 'Leftover legend', how: 'Have 10 leftovers nights' },
  { id: 'out5', name: 'Night off', how: 'Go out for dinner 5 times' },
  { id: 'double5', name: 'Double trouble', how: 'Double 5 dinners' },
  { id: 'veg3', name: 'Veg out', how: 'Three vegetarian dinners in one week' },
  { id: 'variety', name: 'Mix it up', how: 'Five different proteins in one week' },
  { id: 'century', name: 'Century', how: 'Plan 100 dinners' },
  { id: 'recipes25', name: 'Recipe collector', how: 'Save 25 recipes' },
  { id: 'baker5', name: 'Bake off', how: 'Add 5 things to Bake & prep' },
  { id: 'year', name: 'One year of dinners', how: 'Use the app for a whole year' },
  // Secret ones: found on this phone, shown as ??? until found.
  { id: 'clean_sweep', name: 'Clean sweep', how: 'Tick off the whole shopping list', secret: true },
  { id: 'magic_words', name: 'Magic words', how: 'Type a secret word into the shopping list', secret: true },
  { id: 'head_chef', name: 'Head chef', how: 'Tap the version number seven times', secret: true },
  { id: 'night_owl', name: 'Night owl', how: 'Spot the UFO between 2 and 3 am', secret: true },
  { id: 'peekaboo', name: 'Peekaboo', how: 'Catch the pizza peeking out', secret: true },
  { id: 'chefs_pick', name: "Chef's pick", how: "Roll a golden Chef's pick with Surprise me", secret: true },
  { id: 'shake', name: 'Shake it up', how: 'Shake your phone on a night to Surprise me', secret: true },
  { id: 'egg_hunt', name: 'Egg hunter', how: 'Find all the chocolate eggs at Easter', secret: true }
];

const weekKey = (iso) => { const d = fromIso(iso); return isoDate(addDays(d, -((d.getDay() + 6) % 7))); };

// Which household trophies the data has earned. plan rows: { date, kind, recipe_id, multiplier }.
export function earnedTrophies({ plan = [], recipes = [], extrasCount = 0, createdAt, now = new Date() }) {
  const got = new Set();
  const protein = Object.fromEntries(recipes.map((r) => [r.id, r.protein]));
  const cooks = plan.filter((p) => p.kind === 'cook' && p.recipe_id);
  if (cooks.length) got.add('first');
  if (cooks.length >= 100) got.add('century');
  if (plan.filter((p) => p.kind === 'leftovers').length >= 10) got.add('leftovers10');
  if (plan.filter((p) => p.kind === 'out').length >= 5) got.add('out5');
  if (cooks.filter((p) => p.multiplier === 2).length >= 5) got.add('double5');
  if (recipes.length >= 25) got.add('recipes25');
  if (extrasCount >= 5) got.add('baker5');
  if (createdAt && (now - new Date(createdAt)) >= 365 * 86400000) got.add('year');

  const weeks = {};
  for (const p of plan) (weeks[weekKey(p.date)] ||= []).push(p);
  const full = new Set();
  for (const [wk, rows] of Object.entries(weeks)) {
    if (new Set(rows.map((r) => r.date)).size >= 7) full.add(wk);
    const prot = rows.filter((r) => r.kind === 'cook').map((r) => protein[r.recipe_id]).filter(Boolean);
    if (prot.filter((x) => x === 'vegetarian').length >= 3) got.add('veg3');
    if (new Set(prot).size >= 5) got.add('variety');
  }
  if (full.size) got.add('full_week');
  for (const wk of full) {
    let run = 1, d = fromIso(wk);
    while (run < 4 && full.has(isoDate(addDays(d, 7 * run)))) run++;
    if (run >= 4) { got.add('streak4'); break; }
  }
  return got;
}

// Per phone: which trophies this person has seen (so each is announced once) and found secrets.
export const seenTrophies = (householdId) => new Set(read(`wfd-trophies-${householdId}`, []));
export const markSeen = (householdId, ids) => write(`wfd-trophies-${householdId}`, [...new Set([...seenTrophies(householdId), ...ids])]);
export const foundSecrets = () => new Set(read('wfd-secrets', []));

// Record a secret trophy. Returns its name if it's new, so the caller can announce it.
export function findSecret(id) {
  const found = foundSecrets();
  if (found.has(id)) return null;
  found.add(id);
  write('wfd-secrets', [...found]);
  return TROPHIES.find((t) => t.id === id)?.name || null;
}
