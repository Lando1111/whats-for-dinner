// Turn typed or pasted recipe text into structured lines. Plain rules, no AI.
import { normaliseUnit } from './units.js';

const UNICODE_FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };

// "1", "1.5", "1,5", "½", "1½", "1 ½", "1/2", "1 1/2"
const NUM = String.raw`(?:\d+(?:[.,]\d+)?\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[¼½¾⅓⅔⅛⅜⅝⅞])`;

export function parseNumber(s) {
  if (!s) return null;
  s = s.trim().replace(',', '.');
  let m = s.match(/^(\d+(?:\.\d+)?)\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (m) return Number(m[1]) + UNICODE_FRACTIONS[m[2]];
  if (UNICODE_FRACTIONS[s] != null) return UNICODE_FRACTIONS[s];
  m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UNIT_WORDS = 'fl\\.? oz|fluid ounces?|[A-Za-z]+\\.?';

/**
 * Parse one ingredient line.
 * "1 ½ cups plain flour, sifted" → { quantity: 1.5, unit: 'cup', name: 'plain flour', note: 'sifted', ok: true }
 * ok = false when the line looks odd and should be checked by a person.
 */
export function parseIngredient(raw) {
  let line = (raw || '').replace(/^[\s•*·\-–—]+|^\d+[.)]\s+(?=\D)/, '').replace(/\s+/g, ' ').trim();
  if (!line) return null;
  let note = null;
  let quantity = null;
  let unit = null;
  let ok = true;

  // Pull out notes: text in brackets, or after the first comma.
  const br = line.match(/\(([^)]*)\)/);
  if (br) { note = br[1].trim(); line = line.replace(br[0], ' ').replace(/\s+/g, ' ').trim(); }

  // "2 x 400 g tins chickpeas" / "2 × 400g cans"
  let m = line.match(new RegExp(`^(${NUM})\\s*[x×]\\s*(${NUM})\\s*(g|ml|kg|oz)\\b\\s*(.*)$`, 'i'));
  if (m) {
    quantity = parseNumber(m[1]);
    const size = `${m[2].trim()} ${m[3].toLowerCase()}`;
    let rest = m[4];
    const um = rest.match(/^(\S+)\s+(.*)$/);
    if (um && normaliseUnit(um[1])) { unit = normaliseUnit(um[1]); rest = um[2]; } else { unit = 'tin'; }
    note = note ? `${size}, ${note}` : size;
    line = rest;
  } else {
    // Amount, optional range ("1-2"), optional unit.
    m = line.match(new RegExp(`^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(${UNIT_WORDS})?\\s+(.*)$`));
    const glued = line.match(new RegExp(`^(${NUM})(g|kg|ml|l|oz|lb)\\b\\s*(.*)$`, 'i')); // "500g mince"
    if (glued) {
      quantity = parseNumber(glued[1]);
      unit = normaliseUnit(glued[2]);
      line = glued[3];
    } else if (m) {
      quantity = parseNumber(m[1]);
      if (m[2]) note = note ? `${m[1].trim()}–${m[2].trim()}, ${note}` : `${m[1].trim()}–${m[2].trim()}`;
      const u = m[3] && normaliseUnit(m[3]);
      if (u) { unit = u; line = m[4]; } else { line = `${m[3] ? m[3] + ' ' : ''}${m[4]}`; }
    } else if (/^\d/.test(line)) {
      ok = false; // starts with a number we couldn't read, e.g. "11/2 cup5"
    }
  }

  line = line.replace(/^of\s+/i, '').trim();
  const comma = line.indexOf(',');
  if (comma > 0) {
    const after = line.slice(comma + 1).trim();
    note = note ? `${note}, ${after}` : after;
    line = line.slice(0, comma).trim();
  }

  if (/\d[a-z]|[a-z]\d/i.test(line) || (quantity != null && quantity > 5000)) ok = false;
  if (!line) { ok = false; line = raw.trim(); }
  return { quantity, unit, name: line, note: note || null, ok };
}

export function parseIngredients(text) {
  return text.split(/\r?\n/).map(parseIngredient).filter(Boolean);
}

// Method: one step per line, or split numbered paragraphs.
export function parseMethod(text) {
  return text
    .split(/\r?\n+|(?=\b\d+[.)]\s)/)
    .map((s) => s.replace(/^\s*(?:step\s*)?\d+[.):]\s*/i, '').trim())
    .filter(Boolean);
}

// Recipe text often has an "Ingredients" and a "Method" heading; split them when present.
export function splitRecipeText(text) {
  const t = text.replace(/\r/g, '');
  const ing = t.search(/^\s*ingredients\b.*$/im);
  const met = t.search(/^\s*(method|directions|instructions|steps)\b.*$/im);
  if (ing >= 0 && met > ing) {
    const ingBody = t.slice(ing).replace(/^.*\n/, '').slice(0, met - ing).replace(/^\s*(method|directions|instructions|steps)\b.*$/im, '');
    return { ingredients: ingBody.split(/^\s*(method|directions|instructions|steps)\b/im)[0], method: t.slice(met).replace(/^.*\n/, '') };
  }
  return null;
}

// Suggest a protein from ingredient names (the person confirms on the form).
const PROTEIN_WORDS = [
  ['fish', ['fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'barramundi', 'snapper', 'cod', 'mussel', 'calamari', 'squid', 'scallop', 'crab', 'seafood']],
  ['chicken', ['chicken', 'turkey']],
  ['beef', ['beef', 'steak', 'brisket', 'mince', 'veal']],
  ['lamb', ['lamb', 'mutton']],
  ['pork', ['pork', 'bacon', 'ham', 'prosciutto', 'chorizo', 'sausage', 'pancetta', 'salami']]
];
export function guessProtein(names) {
  const text = ` ${names.join(' ').toLowerCase()} `;
  for (const [p, words] of PROTEIN_WORDS) if (words.some((w) => new RegExp(`[^a-z]${w}(s|es)?[^a-z]`).test(text))) return p;
  return 'vegetarian';
}
