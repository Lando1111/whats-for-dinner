// Tidy text read from a photo (on-device OCR) before the normal recipe parser sees it.
// Plain rules for the mistakes text recognition makes on cookbook pages. No AI.
import { normaliseUnit } from './units.js';
import { fixSpelling } from './spellfix.js';

// Words that follow an amount at the start of an ingredient line, besides units.
const COUNT_WORDS = new Set(['large', 'medium', 'small', 'whole', 'piece', 'pieces', 'bunch', 'bunches', 'handful', 'handfuls',
  'heaped', 'level', 'rounded', 'scant', 'generous', 'x']);
const startsAmountWord = (w) => w.length >= 2 && (normaliseUnit(w) || COUNT_WORDS.has(w.toLowerCase()));

const BULLET = /^[\s•*·+»›◦▪●∙‣~\-–—]+(?=\S)|^\s*[.,:;«‹°>]+\s+(?=\S)/;
// A quote-like mark before a word: a misread fraction when a unit follows ("’ cup"), otherwise a misread bullet.
const QUOTE_LEAD = /^(?:\d\s?)?[’'‘"“”`´%]+\s*(?=([A-Za-z]+))/;
const METRIC_GLUE = /^(?:g|gm|gms|kg|kgs|ml|mls|l|lb|lbs|oz)$/i;

/**
 * One ingredient line. "Stablespoons sesame oil" → "? tablespoons sesame oil" ("?" = amount unreadable),
 * "Islice of ginger" → "1 slice of ginger", "S0g cheddar 2" → "50g cheddar", "(455 9)" → "(455 g)".
 */
export function cleanIngredientLine(s) {
  let t = (s || '').replace(/\s+/g, ' ').trim().replace(BULLET, '');
  if (!t) return '';

  // A fraction glyph read as a quote mark or percent sign: amount unknown. Otherwise it was a bullet.
  // Fractions misread as a mark and a digit, or as letters: "“2 of an onion" (½), "Ya cup" (¼), "Y2 cup" (½).
  // Filled in as a best guess, starting with "~" so the line stays highlighted for checking.
  const frac = t.match(/^(?:[%’'‘"“”`´¥\/|]{1,2}|[YVy]|1\/)([24az])\s*([A-Za-z]+)/);
  if (frac && (startsAmountWord(frac[2]) || /^of$/i.test(frac[2]))) {
    const d = frac[1];
    t = t.replace(/^\S+?(?=\s|[A-Za-z]{2})\s*/, `~${/[a4]/.test(d) ? '¼' : '½'} `);
  }
  t = t.replace(/^[’'‘"“”`´]+\s+(?=\d)/, ''); // stray mark before an amount
  const q = t.match(QUOTE_LEAD);
  if (q) t = startsAmountWord(q[1]) || /^of$/i.test(q[1]) || /^\d/.test(t) ? t.replace(QUOTE_LEAD, '? ') : t.replace(QUOTE_LEAD, '');

  // Digit look-alikes inside an amount that has at least one real digit: "S0g" → "50g", "1O0" → "100",
  // but "2large" stays "2large" (the l belongs to the word).
  const lead = t.match(/^([0-9OoSIl|]+)([A-Za-z]*)([\s\S]*)$/);
  if (lead && /\d/.test(lead[1])) {
    for (let k = lead[1].length; k >= 1; k--) {
      const num = lead[1].slice(0, k);
      const word = lead[1].slice(k) + lead[2];
      if (!/\d/.test(num)) break;
      if (!word || startsAmountWord(word) || METRIC_GLUE.test(word)) {
        t = num.replace(/[Oo]/g, '0').replace(/S/g, '5').replace(/[Il|]/g, '1') + word + lead[3];
        break;
      }
    }
  }

  // A single look-alike character before a unit or count word: I | l ! T → 1, Z → 2, S $ → unknown (3 or 5).
  const m = t.match(/^([Il|!TiZzS$])\s?([A-Za-z]+)(.*)$/);
  if (m && startsAmountWord(m[2])) {
    const digit = { Z: '2', z: '2', S: '?', $: '?' }[m[1]] || '1';
    t = `${digit} ${m[2]}${m[3]}`;
  }

  // Number stuck to a word: "2cups" → "2 cups" (but leave "500g" and "1L" alone).
  t = t.replace(/^(\d+(?:[.,]\d+)?[¼½¾⅓⅔⅛]?)([A-Za-z]{2,})/, (all, n, w) => (METRIC_GLUE.test(w) ? all : `${n} ${w}`));

  // A lone | I l before a unit inside the line: "or | bunch", "(I pound" → 1.
  t = t.replace(/(^|[\s(/])[|Il] (\w+)/g, (all, pre, w) => (startsAmountWord(w) ? `${pre}1 ${w}` : all));
  // Zero read for the letter o at the start of a word: "15-0unce" → "15-ounce".
  t = t.replace(/(^|[^\d.,])0(?=[a-z]{2,})/g, '$1o');

  // "g" read as 9 after a number: "(185 9)" "455 9)"
  t = t.replace(/(\d) 9(?=\)|\/|$)/g, '$1 g');

  // Footnote marks at the end: "pasta!" "cheddar 2" "pasta ¹"
  t = t.replace(/\s*[¹²³⁴⁵!’'‘"”`*]+$/, '');
  if (/^[\d?¼½¾]/.test(t)) t = t.replace(/\s\d$/, '');
  return t.trim();
}

const HEADING = /^(?:ingredients?|method|directions?|instructions|steps?|preparation|what (?:we send|you need)|you(?:'ll| will) need|tools|equipment|utensils|allergens|nutrition.*|tips?)\s*:?$/i;
const SERVES_LINE = /^(?:serves|makes|servings?|feeds|yield)\b.*\d/i;
const SKIP_AFTER = /^(tools|equipment|utensils|allergens|nutrition)/i;
const isCapsHeading = (t) => /[A-Z]{3}/.test(t) && t === t.toUpperCase() && !/\d/.test(t);

// The left edge most lines start at (a lone page number or footer further left mustn't set it).
function leftEdge(sized, lineH) {
  if (!sized.length) return null;
  const xs = sized.map((l) => l.x0).sort((a, b) => a - b);
  const need = Math.max(2, Math.ceil(xs.length * 0.2));
  for (const x of xs) if (xs.filter((y) => Math.abs(y - x) <= lineH * 0.5).length >= need) return x;
  return xs[0];
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const toLine = (l) => (typeof l === 'string' ? { text: l } : l);
const lettersIn = (t) => (t.match(/[A-Za-z]/g) || []).length;

function hasOpenBracket(t) { return (t.match(/\(/g) || []).length > (t.match(/\)/g) || []).length; }
function endsMidPhrase(t) { return /(?:[,\-–/]|\b(?:or|and|with|with a|of|plus|to|into|the|a))$/i.test(t.trim()); }
function joinText(a, b) {
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a + b; // "store-" + "bought"
  return `${a} ${b}`;
}

/**
 * Ingredient lines from one or more boxes. Each line is a string or { text, x0, x1, h } from OCR.
 * Joins wrapped lines (hanging indent or an unfinished bracket), drops headings and tool lists.
 */
export function joinIngredientLines(boxes) {
  const out = [];
  for (const box of boxes) {
    const lines = box.map(toLine).filter((l) => l.text && l.text.trim());
    const sized = lines.filter((l) => l.x0 != null && lettersIn(l.text) >= 3);
    const lineH = median(sized.map((l) => l.h || 0)) || 30;
    const margin = leftEdge(sized, lineH);
    const capsBook = lines.filter((l) => isCapsHeading(l.text.trim())).length > lines.length / 2;
    let skipping = false;
    let prev = null;
    for (const l of lines) {
      const raw = l.text.trim();
      const bulleted = BULLET.test(raw) && !/^[-–]\s*\d/.test(raw);
      const text = raw.replace(BULLET, '').trim();
      if (SERVES_LINE.test(text)) { prev = null; continue; }
      if (HEADING.test(text) || (!capsBook && isCapsHeading(text) && text.split(' ').length <= 4)) {
        skipping = SKIP_AFTER.test(text);
        prev = null;
        continue;
      }
      if (skipping) continue;
      const indented = margin != null && l.x0 != null && l.x0 > margin + lineH * 0.8;
      // With positions from the photo, the hanging indent decides (a dropped ")" mustn't swallow the next
      // ingredient). Without them (pasted text), go by unfinished brackets and phrases.
      const placed = margin != null && l.x0 != null;
      const startsAmount = /^[\d¼½¾⅓⅔?~]/.test(cleanIngredientLine(text));
      // A line that starts with an amount is always a new ingredient.
      const carry = prev && !bulleted && !startsAmount && (
        (placed && (indented || /[A-Za-z]-$/.test(prev.text)))
        || hasOpenBracket(prev.text) || endsMidPhrase(prev.text));
      if (carry) prev.text = joinText(prev.text, text);
      else { prev = { text }; out.push(prev); }
    }
  }
  return out.map((l) => fixSpelling(cleanIngredientLine(l.text))).filter((t) => t && lettersIn(t) >= 2);
}

/**
 * Method steps from one or more boxes. A new step starts at an indented first line, a step number,
 * or after a line that ends a sentence well short of the column edge.
 */
export function joinMethodLines(boxes) {
  const steps = [];
  for (const box of boxes) {
    const lines = box.map(toLine).filter((l) => l.text && lettersIn(l.text) >= 1);
    const sized = lines.filter((l) => l.x0 != null && lettersIn(l.text) >= 3);
    const lineH = median(sized.map((l) => l.h || 0)) || 30;
    const margin = leftEdge(sized, lineH);
    const right = sized.length ? Math.max(...sized.map((l) => l.x1)) : null;
    const paras = [];
    let cur = null;
    let prevLine = null;
    for (const l of lines) {
      const text = l.text.replace(/\s+/g, ' ').trim();
      if (/^(method|directions?|instructions|steps?|preparation)$/i.test(text)) continue;
      const numbered = /^(?:step\s*)?\d+[.):]\s+\S/i.test(text);
      const indented = margin != null && l.x0 != null && l.x0 > margin + lineH * 1.2;
      const prevEnded = prevLine && /[.!)]$/.test(prevLine.text.trim()) && right != null && prevLine.x1 != null && prevLine.x1 < right - lineH * 3;
      const prevHeading = prevLine && /^(?:step\s*)?\d+[.):]\s+\S/i.test(prevLine.text) && prevLine.text.length <= 44 && !/[.!?,]$/.test(prevLine.text);
      if (!cur || numbered || indented || prevEnded || prevHeading) { cur = { text }; paras.push(cur); } else cur.text = joinText(cur.text, text);
      prevLine = { ...l, text };
    }
    // A short heading with no full stop ("1. Prep ingredients") joins the step under it.
    for (let i = 0; i < paras.length; i++) {
      const p = paras[i].text.replace(/^(?:step\s*)?\d+[.):]\s*/i, '');
      if (i + 1 < paras.length && p.length <= 40 && !/[.!?]$/.test(p)) {
        paras[i + 1].text = `${p}: ${paras[i + 1].text.replace(/^(?:step\s*)?\d+[.):]\s*/i, '')}`;
        paras[i].text = '';
      }
    }
    for (const p of paras) {
      const t = p.text.replace(/^(?:step\s*)?\d+[.):]\s*/i, '').trim()
        .replace(/(\d)\s?[%Y]2\b/g, '$1½').replace(/(\d)\s?[%Y]4\b/g, '$1¼'); // "1%2 hours" → "1½ hours"
      if (t && lettersIn(t) >= 3) steps.push(t);
    }
  }
  return steps;
}

export function findServings(text) {
  const m = (text || '').match(/\b(?:serves|servings?|makes|feeds)\s*:?\s*(\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

// "HEARTY SAUSAGE STEW" → "Hearty sausage stew"
export function tidyTitle(text) {
  let t = (text || '').replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)!?]+$/g, '').trim();
  if (t && t === t.toUpperCase()) t = t.charAt(0) + t.slice(1).toLowerCase();
  return t.slice(0, 120);
}

// Which measuring system a page was written in. Australian unless there are clear US signs.
export function guessSystem(text) {
  const t = text || '';
  if (/\b(\d+\s*-?\s*ounces?|pounds?|quarts?|pints?|\d+-inch|flavor|color|broil)\b|°\s?F\b|\(2[34]\d\s?ml\)/i.test(t)) return 'US';
  if (/\b\d+\s?°?C\b|\btbs\b|\bmins\b|250\s?ml|\(1 cup\)/i.test(t)) return 'AU';
  return 'AU';
}
