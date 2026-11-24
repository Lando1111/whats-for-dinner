// Measurement maths for recipes: units, systems, densities, scaling, conversion and tidy display.
// Plain rules only. Australian measures are the default.

// Canonical unit names and the words people write for them.
export const UNIT_ALIASES = {
  g: ['g', 'gm', 'gms', 'gram', 'grams', 'gramme', 'grammes'],
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  oz: ['oz', 'ounce', 'ounces'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  ml: ['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  l: ['l', 'litre', 'litres', 'liter', 'liters', 'ltr'],
  tsp: ['tsp', 'tsps', 't', 'teaspoon', 'teaspoons', 'teasp'],
  tbsp: ['tbsp', 'tbsps', 'tbs', 'tbl', 'tblsp', 'tablespoon', 'tablespoons', 'tbspn', 'T'],
  cup: ['cup', 'cups', 'c'],
  fl_oz: ['fl oz', 'floz', 'fluid ounce', 'fluid ounces'],
  pinch: ['pinch', 'pinches'],
  tin: ['tin', 'tins', 'can', 'cans'],
  clove: ['clove', 'cloves'],
  bunch: ['bunch', 'bunches'],
  packet: ['packet', 'packets', 'pkt', 'pack', 'packs'],
  slice: ['slice', 'slices'],
  sprig: ['sprig', 'sprigs'],
  handful: ['handful', 'handfuls'],
  jar: ['jar', 'jars'],
  sheet: ['sheet', 'sheets'],
  stalk: ['stalk', 'stalks', 'stick', 'sticks']
};

const ALIAS_TO_UNIT = Object.fromEntries(
  Object.entries(UNIT_ALIASES).flatMap(([unit, words]) => words.map((w) => [w === 'T' ? w : w.toLowerCase(), unit]))
);

export function normaliseUnit(word) {
  if (!word) return null;
  const w = word.trim().replace(/\.$/, '');
  if (w === 'T') return 'tbsp'; // capital T is a tablespoon in older books
  return ALIAS_TO_UNIT[w.toLowerCase()] || null;
}

const MASS_G = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };

// Millilitres per unit in each measuring system.
const VOLUME_ML = {
  AU: { ml: 1, l: 1000, tsp: 5, tbsp: 20, cup: 250, fl_oz: 28.41 },
  US: { ml: 1, l: 1000, tsp: 4.929, tbsp: 14.787, cup: 236.59, fl_oz: 29.574 },
  UK: { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 250, fl_oz: 28.41 },
  metric: { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 250, fl_oz: 28.41 }
};

export const isMass = (u) => u in MASS_G;
export const isVolume = (u) => u in VOLUME_ML.AU;
export const toGrams = (q, u) => q * MASS_G[u];
export const toMl = (q, u, system = 'AU') => q * (VOLUME_ML[system] || VOLUME_ML.AU)[u];

// Grams per 250 ml (Australian cup). Approximate kitchen values; households can add their own.
export const DENSITIES = {
  'plain flour': 150, 'self-raising flour': 150, 'self raising flour': 150, 'wholemeal flour': 160, 'bread flour': 150,
  flour: 150, cornflour: 130, 'corn flour': 130, 'caster sugar': 220, 'white sugar': 220, sugar: 220,
  'brown sugar': 200, 'icing sugar': 150, 'raw sugar': 220, 'cocoa powder': 100, cocoa: 100,
  rice: 200, 'long grain rice': 200, 'basmati rice': 200, 'jasmine rice': 200, 'arborio rice': 220, 'brown rice': 200,
  'rolled oats': 90, oats: 90, quinoa: 190, couscous: 190, 'red lentils': 200, lentils: 200, 'split peas': 200,
  butter: 240, 'grated cheese': 100, 'grated cheddar': 100, cheddar: 100, 'grated parmesan': 80, parmesan: 80, mozzarella: 100,
  breadcrumbs: 80, panko: 60, 'panko breadcrumbs': 60, 'desiccated coconut': 90, 'shredded coconut': 75, 'almond meal': 100,
  'chocolate chips': 190, sultanas: 160, raisins: 160, 'frozen peas': 140, peas: 140, 'corn kernels': 160,
  honey: 350, 'maple syrup': 330, 'golden syrup': 350, 'peanut butter': 260, 'baby spinach': 30, spinach: 30,
  'cashews': 140, 'walnuts': 110, 'pecans': 110, 'almonds': 150, 'pine nuts': 150, 'sesame seeds': 150
};

export function densityFor(name, extra = {}) {
  const n = (name || '').toLowerCase().trim();
  if (extra[n]) return extra[n];
  if (DENSITIES[n]) return DENSITIES[n];
  // Longest known name contained in the ingredient, e.g. "sifted plain flour".
  let best = null;
  for (const key of [...Object.keys(extra), ...Object.keys(DENSITIES)]) {
    if (n.includes(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? extra[best] || DENSITIES[best] : null;
}

const LIQUID_WORDS = ['water', 'milk', 'stock', 'broth', 'cream', 'oil', 'juice', 'wine', 'vinegar', 'sauce', 'buttermilk', 'yoghurt', 'yogurt', 'coconut milk', 'beer', 'passata', 'syrup', 'honey', 'extract', 'essence'];
export function kindOf(name) {
  const n = (name || '').toLowerCase();
  if (/\bbutter\b/.test(n) && !/peanut butter|buttermilk|butter beans/.test(n)) return 'butter';
  if (LIQUID_WORDS.some((w) => n.includes(w))) return 'liquid';
  return 'dry';
}

// ---------- display ----------
const FRACTIONS = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

export function formatQty(q) {
  if (q == null || Number.isNaN(q)) return '';
  if (q >= 10) return String(Math.round(q));
  const whole = Math.floor(q + 1e-9);
  const frac = q - whole;
  if (frac < 0.06) return String(whole || (q > 0 ? q.toFixed(1).replace(/\.0$/, '') : '0'));
  if (frac > 0.94) return String(whole + 1);
  const [, glyph] = FRACTIONS.reduce((a, b) => (Math.abs(b[0] - frac) < Math.abs(a[0] - frac) ? b : a));
  return whole ? `${whole}${glyph}` : glyph;
}

const roundTo = (q, step) => Math.round(q / step) * step;
const UNIT_LABEL = { g: 'g', kg: 'kg', ml: 'ml', l: 'L', tsp: 'tsp', tbsp: 'tbsp', cup: 'cup', oz: 'oz', lb: 'lb', fl_oz: 'fl oz' };

export function unitLabel(unit, q = 1) {
  if (!unit) return '';
  if (UNIT_LABEL[unit]) return unit === 'cup' && q > 1 ? 'cups' : UNIT_LABEL[unit];
  return q > 1 && !unit.endsWith('s') ? `${unit}s` : unit;
}

// Tidy a metric amount: 1000 g → 1 kg, 1250 ml → 1.25 L, sensible rounding.
function tidyMetric(q, base) {
  if (base === 'g') {
    if (q >= 1000) return { q: roundTo(q / 1000, 0.05), unit: 'kg', exact: true };
    return { q: q < 20 ? Math.round(q) : q < 100 ? roundTo(q, 5) : roundTo(q, 10), unit: 'g', exact: true };
  }
  if (q >= 1000) return { q: roundTo(q / 1000, 0.05), unit: 'l', exact: true };
  return { q: q < 20 ? Math.round(q) : q < 100 ? roundTo(q, 5) : roundTo(q, 10), unit: 'ml', exact: true };
}

function spoons(ml) {
  if (ml < 15) return { q: roundTo(ml / 5, 0.25), unit: 'tsp' };
  return { q: roundTo(ml / 20, 0.25), unit: 'tbsp' };
}

/**
 * Convert one ingredient to the household's units.
 * line: { quantity, unit, name }, system: source measuring system, prefs: { dry, liquid, butter }
 * Returns { q, unit, converted (bool) }.
 */
export function convertLine(line, { system = 'AU', prefs = {}, multiplier = 1, densities = {} } = {}) {
  const q0 = line.quantity == null ? null : Number(line.quantity) * multiplier;
  const unit = normaliseUnit(line.unit) || line.unit || null;
  if (q0 == null) return { q: null, unit, converted: false };
  const kind = kindOf(line.name);
  const p = { dry: 'g', liquid: 'ml', butter: 'g', ...prefs };

  if (isMass(unit)) {
    if (unit === 'g' || unit === 'kg') { const t = tidyMetric(toGrams(q0, unit), 'g'); return { ...t, converted: false }; }
    return { ...tidyMetric(toGrams(q0, unit), 'g'), converted: true };
  }

  if (isVolume(unit)) {
    const ml = toMl(q0, unit, system);
    const sourceIsMetric = system === 'AU' || system === 'metric';
    const changedSystem = !sourceIsMetric && ['tsp', 'tbsp', 'cup', 'fl_oz'].includes(unit);
    // Small amounts stay in spoons (in Australian spoon sizes).
    if (ml < 62.5 && unit !== 'ml' && unit !== 'l') {
      const s = spoons(ml);
      return { ...s, converted: changedSystem || s.unit !== unit };
    }
    const wantGrams = (kind === 'dry' && p.dry === 'g') || (kind === 'butter' && p.butter === 'g');
    if (wantGrams) {
      const d = densityFor(line.name, densities);
      if (d) return { ...tidyMetric((ml / 250) * d, 'g'), converted: true };
    }
    if (kind === 'liquid' && p.liquid === 'ml') return { ...tidyMetric(ml, 'ml'), converted: unit !== 'ml' && unit !== 'l' };
    if (unit === 'ml' || unit === 'l') {
      if (kind === 'liquid' && p.liquid === 'cup' && ml >= 62.5) return { q: roundTo(ml / 250, 0.25), unit: 'cup', converted: true };
      return { ...tidyMetric(ml, 'ml'), converted: false };
    }
    // Keep as cups, in Australian cup sizes.
    return { q: roundTo(ml / 250, 0.25) || roundTo(ml / 250, 0.125), unit: 'cup', converted: changedSystem };
  }

  // Butter written in grams but the household wants tablespoons.
  return { q: q0, unit, converted: false };
}

export function formatAmount({ q, unit }) {
  if (q == null) return '';
  const n = unit === 'kg' || unit === 'l' ? String(Number(q.toFixed(2))) : formatQty(q);
  const label = unitLabel(unit, q);
  return label ? `${n} ${label}`.replace(/^(\d+) (g|ml|kg|L)$/, '$1 $2') : n;
}

// Original amount as written, scaled.
export function formatOriginal(line, multiplier = 1, system = 'AU') {
  if (line.quantity == null) return '';
  const u = normaliseUnit(line.unit) || line.unit;
  const amt = formatAmount({ q: Number(line.quantity) * multiplier, unit: u });
  const sys = system === 'US' && ['tsp', 'tbsp', 'cup', 'fl_oz'].includes(u) ? 'US ' : system === 'UK' && u === 'fl_oz' ? 'UK ' : '';
  return sys ? amt.replace(/^([\d¼½¾⅓⅔⅛.]+) /, `$1 ${sys}`) : amt;
}

// °F → °C in method text, keeping the original in brackets.
export function fahrenheitToCelsius(text) {
  return text.replace(/(\d{3})\s*°?\s*F\b/g, (m, f) => {
    const c = Math.round(((Number(f) - 32) * 5) / 9 / 10) * 10;
    return `${c}°C (${f}°F)`;
  });
}

// Merge key for shopping: same ingredient name + same unit family.
export function mergeKey(name, unit) {
  return `${(name || '').toLowerCase().trim()}|${unit || ''}`;
}
