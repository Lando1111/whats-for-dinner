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
// Units that books often follow with a metric amount in brackets: "2 cups (410 g)", "2 quarts (2 L)".
const NON_METRIC = ['cup', 'tbsp', 'tsp', 'quart', 'pint', 'oz', 'lb', 'fl_oz'];
const METRIC_IN_BRACKETS = new RegExp(`^(?:about|approx\\.?|approximately|~)?\\s*(${NUM})(?:\\s*[-–]\\s*(${NUM}))?\\s*(g|kg|ml|l)$`, 'i');
const AMOUNT_AND_UNIT = new RegExp(`^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(${UNIT_WORDS})\\s*$`);
const METRIC_GLUE = /^(?:g|gm|gms|kg|kgs|ml|mls|l|lb|lbs|oz)$/i;

/**
 * Parse one ingredient line.
 * "1 ½ cups plain flour, sifted" → { quantity: 1.5, unit: 'cup', name: 'plain flour', note: 'sifted', ok: true }
 * "2 cups (410 g) cooked rice" → 410 g, with "2 cups" kept in the note.
 * "? cup oil" (amount unreadable in a photo) → no amount, flagged.
 * ok = false when the line looks odd and should be checked by a person.
 */
/**
 * Tidy a line from a recipe website (or pasted from one): HTML entities, brackets inside brackets,
 * notes like "(, chopped)" or "((or thigh))", "Note 1" references, and stray commas and dots.
 * "2 cups milk (, any fat % (Note 1))" → "2 cups milk (any fat %)"
 */
export function tidyLine(raw) {
  let s = (raw || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[[{]/g, '(').replace(/[\]}]/g, ')')
    .replace(/\(?\s*\bnotes?\s*\d+(?:\s*(?:,|&|and)\s*\d+)*\s*\)?/gi, ' '); // "(Note 1)", "Note 2"
  // One level of brackets: keep each top-level group, flatten anything nested inside it.
  let out = '';
  let group = '';
  let depth = 0;
  const tidyNote = (t) => t.replace(/\s+/g, ' ').replace(/\s*\.\s+(?=[a-z])/g, ', ').replace(/(\s*,\s*)+/g, ', ').replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, '');
  for (const ch of s) {
    if (ch === '(') { if (depth > 0) group += ', '; depth++; continue; }
    if (ch === ')') {
      if (depth === 0) continue; // a stray ")"
      depth--;
      if (depth === 0) { const t = tidyNote(group); if (t) out += ` (${t}) `; group = ''; }
      continue;
    }
    if (depth > 0) group += ch; else out += ch;
  }
  if (depth > 0) { const t = tidyNote(group); if (t) out += ` (${t})`; }
  return out
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/,(\s*,)+/g, ',')
    .replace(/\s\.\s/g, ', ')
    .replace(/[,\s]+$/, '')
    .trim();
}

// "600 g/1.2lb chicken" or "1.2lb/600g chicken": keep the metric amount, the other goes in the note.
const METRIC_UNITS = ['g', 'kg', 'ml', 'l'];
function pickMetric(line, notes) {
  const m = line.match(new RegExp(`^(${NUM})\\s*([A-Za-z]+\\.?)\\s*\\/\\s*(${NUM})\\s*([A-Za-z]+\\.?)(?=[\\s,(]|$)(.*)$`));
  if (!m) return line;
  const u1 = normaliseUnit(m[2]); const u2 = normaliseUnit(m[4]);
  if (!u1 || !u2) return line;
  const firstMetric = METRIC_UNITS.includes(u1);
  const secondMetric = METRIC_UNITS.includes(u2);
  const [keep, other] = !firstMetric && secondMetric ? [[m[3], m[4]], [m[1], m[2]]] : [[m[1], m[2]], [m[3], m[4]]];
  notes.push(`${other[0].trim()} ${other[1]}`);
  return `${keep[0].trim()} ${keep[1]}${m[5]}`;
}

export function parseIngredient(raw) {
  let line = tidyLine(raw).replace(/^[\s•*·+»›◦▪●∙‣\-–—]+|^\s*[.,:;«‹°>]+\s+|^\d+[.)]\s+(?=\D)/, '').replace(/\s+/g, ' ').trim();
  if (!line) return null;
  line = line.replace(/^\.(\d)/, '0.$1'); // ".5 cup" → "0.5 cup"
  let quantity = null;
  let unit = null;
  let ok = true;
  const notes = [];

  // "?" = the amount couldn't be read; "~" = the amount is a best guess (both from photo import).
  let unknownAmount = false;
  if (line.startsWith('?')) { unknownAmount = true; ok = false; line = line.slice(1).trim(); }
  let guessed = false;
  if (line.startsWith('~')) { guessed = true; line = line.slice(1).trim(); }

  // "2cups rice" → "2 cups rice" (but keep "500g").
  line = line.replace(new RegExp(`^(${NUM})([A-Za-z]{2,})`), (all, n, w) => (METRIC_GLUE.test(w) ? all : `${n} ${w}`));
  line = pickMetric(line, notes);

  // Brackets: close one the photo lost ("(adds depth of flavor, optional"); a stray ")" is checked by a person.
  const opens = (line.match(/\(/g) || []).length;
  const closes = (line.match(/\)/g) || []).length;
  if (opens > closes) line += ')'.repeat(opens - closes);
  else if (closes > opens) ok = false;

  // A metric amount in brackets right after the amount and unit replaces it.
  const first = line.match(/\(([^)]*)\)/);
  if (first) {
    const before = line.slice(0, first.index).trim();
    const au = unknownAmount ? before.match(new RegExp(`^()()(${UNIT_WORDS})$`)) : before.match(AMOUNT_AND_UNIT);
    const mm = first[1].trim().match(METRIC_IN_BRACKETS);
    if (au && mm && NON_METRIC.includes(normaliseUnit(au[3]))) {
      if (unknownAmount) { unknownAmount = false; ok = true; } else if (guessed) guessed = false; else notes.push(before);
      line = `${mm[1]}${mm[2] ? `–${mm[2]}` : ''} ${mm[3]} ${line.slice(first.index + first[0].length)}`.replace(/\s+/g, ' ').trim();
    }
  }

  // Every other bracket becomes part of the note.
  line = line.replace(/\(([^)]*)\)/g, (all, inner) => { if (inner.trim()) notes.push(inner.trim()); return ' '; }).replace(/\s+/g, ' ').trim();

  // "2 x 400 g tins chickpeas" / "2 × 400g cans"
  let m = line.match(new RegExp(`^(${NUM})\\s*[x×]\\s*(${NUM})\\s*(g|ml|kg|oz)\\b\\s*(.*)$`, 'i'));
  if (m) {
    quantity = parseNumber(m[1]);
    const size = `${m[2].trim()} ${m[3].toLowerCase()}`;
    let rest = m[4];
    const um = rest.match(/^(\S+)\s+(.*)$/);
    if (um && normaliseUnit(um[1])) { unit = normaliseUnit(um[1]); rest = um[2]; } else { unit = 'tin'; }
    notes.unshift(size);
    line = rest;
  } else if (unknownAmount) {
    const um = line.match(new RegExp(`^(${UNIT_WORDS})\\s+(.*)$`));
    if (um && normaliseUnit(um[1])) { unit = normaliseUnit(um[1]); line = um[2]; }
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
      if (m[2]) notes.unshift(`${m[1].trim()}–${m[2].trim()}`);
      const u = m[3] && normaliseUnit(m[3]);
      if (u) { unit = u; line = m[4]; } else { line = `${m[3] ? m[3] + ' ' : ''}${m[4]}`; }
    } else if (/^\d/.test(line)) {
      ok = false; // starts with a number we couldn't read, e.g. "11/2 cup5"
    }
  }

  line = line.replace(/^of\s+/i, '').trim();
  if (quantity != null || unknownAmount || guessed) line = line.replace(/^an?\s+(?=\S)/i, ''); // "½ of a white onion" → "white onion"
  const comma = line.indexOf(',');
  if (comma > 0) {
    notes.push(line.slice(comma + 1).trim());
    line = line.slice(0, comma).trim();
  }

  if (/\d[a-z]|[a-z]\d/i.test(line) || (quantity != null && quantity > 5000)) ok = false;
  // A big bare number is a page number or misread, not "148 onions".
  if (quantity != null && !unit && quantity > 50) ok = false;
  // Amounts that are probably misread: "14 tbsp" (was 1½), "25 cups".
  if (quantity != null && ((['tsp', 'tbsp'].includes(unit) && quantity >= 10) || (unit === 'cup' && quantity > 10))) ok = false;
  // Odd capitals inside a word ("pepPPE") come from misread text.
  if (/[a-z][A-Z]/.test(line)) ok = false;
  // Lines with no amount that look like a piece of another line, or like misread text.
  if (quantity == null && !unknownAmount) {
    // Starts with a unit but has no amount: "tablespoons sesame oil".
    const firstWord = line.split(' ')[0];
    if (firstWord.length > 2 && normaliseUnit(firstWord)) ok = false;
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    const words = line.split(' ');
    const scraps = words.filter((w) => (w.match(/[A-Za-z]/g) || []).length <= 2).length;
    if (letters < 4 || letters / line.length < 0.6 || (words.length >= 3 && scraps / words.length >= 0.5) || /(?:\b(?:with|and|or|of|plus|to|a|the)|[,\-–])$/i.test(line)) ok = false;
  }
  if (guessed) ok = false;
  if (!line) { ok = false; line = raw.trim(); }
  const note = notes.filter(Boolean).join(', ');
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
