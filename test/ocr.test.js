// Rules for text read from photos. Lines are short examples of the kinds of mistakes
// text recognition made on real cookbook and meal-kit photos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanIngredientLine, joinIngredientLines, joinMethodLines, findServings, tidyTitle, guessSystem } from '../src/lib/ocrtext.js';
import { parseIngredient, parseIngredients } from '../src/lib/parse.js';
import { normaliseUnit, convertLine } from '../src/lib/units.js';
import { fixSpelling } from '../src/lib/spellfix.js';

test('look-alike characters and glued amounts', () => {
  assert.equal(cleanIngredientLine('2cups cooked rice'), '2 cups cooked rice');
  assert.equal(cleanIngredientLine('Stablespoons sesame oil'), '? tablespoons sesame oil');
  assert.equal(cleanIngredientLine('Spieces of bacon'), '? pieces of bacon');
  assert.equal(cleanIngredientLine('Islice of fresh ginger'), '1 slice of fresh ginger');
  assert.equal(cleanIngredientLine('| bunch spinach'), '1 bunch spinach');
  assert.equal(cleanIngredientLine('I cup couscous'), '1 cup couscous');
  assert.equal(cleanIngredientLine('Ttsp sugar'), '1 tsp sugar');
  assert.equal(cleanIngredientLine('Zlarge eggs'), '2 large eggs');
  assert.equal(cleanIngredientLine('+ S0g cheddar 2'), '50g cheddar');
  assert.equal(cleanIngredientLine('• 200g macaroni pasta!'), '200g macaroni pasta');
  assert.equal(cleanIngredientLine('’ cup (60 ml) cooking oil'), '? cup (60 ml) cooking oil');
  assert.equal(cleanIngredientLine('4 sausages (I Pound/455 9) cut up'), '4 sausages (1 Pound/455 g) cut up');
  // Real words that start with those letters are left alone.
  for (const w of ['Salt and pepper', 'Spinach leaves', 'Zucchini', 'Thyme', 'Iceberg lettuce', 'lemon zest', 'Tomatoes']) {
    assert.equal(cleanIngredientLine(w), w);
  }
});

test('wrapped lines join using the hanging indent', () => {
  const box = [
    { text: '2 cups (410 g) cooked white rice (leftover rice', x0: 10, x1: 600, h: 30 },
    { text: 'will work best here)', x0: 50, x1: 400, h: 30 },
    { text: 'Serves 2', x0: 10, x1: 120, h: 30 },
    { text: '3 tablespoons sesame oil, plus more as', x0: 10, x1: 560, h: 30 },
    { text: 'needed', x0: 52, x1: 150, h: 30 },
    { text: 'Sea salt and freshly ground pepper', x0: 11, x1: 500, h: 30 }
  ];
  assert.deepEqual(joinIngredientLines([box]), [
    '2 cups (410 g) cooked white rice (leftover rice will work best here)',
    '3 tablespoons sesame oil, plus more as needed',
    'Sea salt and freshly ground pepper'
  ]);
});

test('wrapped lines join without positions (pasted text)', () => {
  assert.deepEqual(joinIngredientLines([[
    '2 quarts (2 L) broth (see homemade', 'options, or use store-', 'bought)', '4 cloves garlic, roughly chopped'
  ]]), ['2 quarts (2 L) broth (see homemade options, or use store-bought)', '4 cloves garlic, roughly chopped']);
});

test('headings, bullets and tool lists', () => {
  const lines = joinIngredientLines([[
    'WHAT WE SEND', '+ beef mince', '+ 2 vegetable stock cubes', '* Tzucchini', 'WHAT YOU NEED', '+ 2 garlic cloves',
    '+ 1 tbs balsamic vinegar', 'TOOLS', '+ baking paper', '» large frypan'
  ]]);
  assert.deepEqual(lines, ['beef mince', '2 vegetable stock cubes', 'Tzucchini', '2 garlic cloves', '1 tbs balsamic vinegar']);
});

test('metric amounts in brackets are used', () => {
  let p = parseIngredient('2 cups (410 g) cooked white rice');
  assert.deepEqual([p.quantity, p.unit, p.name, p.note], [410, 'g', 'cooked white rice', '2 cups']);
  p = parseIngredient('2 quarts (2 L) broth of choice');
  assert.deepEqual([p.quantity, p.unit, p.name], [2, 'l', 'broth of choice']);
  p = parseIngredient('1 cup (about 200 g) couscous');
  assert.deepEqual([p.quantity, p.unit], [200, 'g']);
  p = parseIngredient('? cup (60 ml) cooking oil');
  assert.deepEqual([p.quantity, p.unit, p.name, p.ok], [60, 'ml', 'cooking oil', true]);
  // Not straight after the unit: stays a note.
  p = parseIngredient('6 small red potatoes, cut into cubes (about 4 cups/560 g)');
  assert.deepEqual([p.quantity, p.unit, p.name], [6, null, 'small red potatoes']);
  // Metric first, cups in brackets: unchanged.
  p = parseIngredient('250ml (1 cup) cooking water');
  assert.deepEqual([p.quantity, p.unit, p.name, p.note], [250, 'ml', 'cooking water', '1 cup']);
});

test('unreadable amounts and fragments are flagged', () => {
  const p = parseIngredient('? tablespoons sesame oil');
  assert.deepEqual([p.quantity, p.unit, p.name, p.ok], [null, 'tbsp', 'sesame oil', false]);
  assert.equal(parseIngredient('beaten with a').ok, false);
  assert.equal(parseIngredient('ion').ok, false);
  assert.equal(parseIngredient('Seq enla If. hd: ;').ok, false);
  assert.equal(parseIngredient('Sea salt').ok, true);
  assert.equal(parseIngredient('Freshly ground black pepper').ok, true);
  assert.deepEqual([parseIngredient('3 slices Parmesan rind (adds depth, optional').note, parseIngredient('cooked rice (leftover rice').ok], ['adds depth, optional', true]);
});

test('pints, quarts and tbs read as ths', () => {
  assert.equal(normaliseUnit('quarts'), 'quart');
  assert.equal(normaliseUnit('ths'), 'tbsp');
  const c = convertLine({ quantity: 1, unit: 'quart', name: 'chicken stock' }, { system: 'US' });
  assert.deepEqual([c.q, c.unit], [950, 'ml']);
  assert.equal(parseIngredients('1 ths olive oil')[0].unit, 'tbsp');
});

test('method lines become steps', () => {
  const steps = joinMethodLines([[
    { text: 'If making rice from scratch, wash and', x0: 10, x1: 600, h: 30 },
    { text: 'rinse the rice. A rice cooker helps.', x0: 10, x1: 560, h: 30 },
    { text: 'Using 2 cups of this rice, heat the oil in a', x0: 60, x1: 600, h: 30 },
    { text: 'frying pan and add the garlic.', x0: 10, x1: 420, h: 30 },
    { text: 'Pour in the eggs and stir.', x0: 60, x1: 400, h: 30 }
  ], [
    { text: '1. Prep ingredients', x0: 5, x1: 300, h: 28 },
    { text: 'Preheat the oven to 220C. Line a tray with', x0: 5, x1: 640, h: 28 },
    { text: 'baking paper.', x0: 5, x1: 200, h: 28 }
  ]]);
  assert.deepEqual(steps, [
    'If making rice from scratch, wash and rinse the rice. A rice cooker helps.',
    'Using 2 cups of this rice, heat the oil in a frying pan and add the garlic.',
    'Pour in the eggs and stir.',
    'Prep ingredients: Preheat the oven to 220C. Line a tray with baking paper.'
  ]);
});

test('servings, title and measuring system', () => {
  assert.equal(findServings('Serves 6–8'), 6);
  assert.equal(findServings('SERVES 2'), 2);
  assert.equal(findServings('no number here'), null);
  assert.equal(tidyTitle('HEARTY SAUSAGE STEW'), 'Hearty sausage stew');
  assert.equal(tidyTitle('  Ginger Fried Rice. '), 'Ginger Fried Rice');
  assert.equal(guessSystem('Add 1 cup (240 ml) water. Golden in color.'), 'US');
  assert.equal(guessSystem('one 15-ounce can of tomatoes'), 'US');
  assert.equal(guessSystem('Preheat the oven to 220C. Reserve 250ml (1 cup)'), 'AU');
  assert.equal(guessSystem('2 cups plain flour'), 'AU');
});

test('more look-alikes from real photos', () => {
  assert.equal(cleanIngredientLine('2large pasture-raised eggs'), '2 large pasture-raised eggs');
  assert.equal(cleanIngredientLine('3 large handfuls Swiss chard or | bunch spinach'), '3 large handfuls Swiss chard or 1 bunch spinach');
  assert.equal(cleanIngredientLine('4 sausages (I pound/455 9)'), '4 sausages (1 pound/455 g)');
  assert.equal(cleanIngredientLine('one 15-0unce can'), 'one 15-ounce can');
  assert.equal(cleanIngredientLine('100g butter'), '100g butter');
  assert.equal(parseIngredient('14 tbsp olive oil').ok, false); // probably 1½
  assert.equal(parseIngredient('tablespoons sesame oil').ok, false);
  assert.equal(parseIngredient('Ee LL. nund pepPPE').ok, false);
  assert.equal(parseIngredient('2 tbsp olive oil').ok, true);
});

test('bullets read as dots and arrows on a phone photo', () => {
  assert.deepEqual(joinIngredientLines([['WHAT WE SEND', '. beef mince', '. 2 vegetable stock cubes', '. 200g macaroni pasta’', '« thyme', "' 1 zucchini", '« 2 garlic cloves']]),
    ['beef mince', '2 vegetable stock cubes', '200g macaroni pasta', 'thyme', '1 zucchini', '2 garlic cloves']);
  assert.equal(cleanIngredientLine('’ of a white onion'), '? of a white onion');
  assert.equal(cleanIngredientLine('’ cup oil'), '? cup oil');
  assert.equal(parseIngredient('. 2 vegetable stock cubes').quantity, 2);
  assert.equal(parseIngredient('.5 cup milk').quantity, 0.5);
});

test('fractions misread as letters, and a dropped bracket', () => {
  assert.equal(cleanIngredientLine('Ya cup (60 ml) cooking oil'), '~¼ cup (60 ml) cooking oil');
  assert.equal(cleanIngredientLine('Y2 of a white onion'), '~½ of a white onion');
  assert.equal(cleanIngredientLine('“2 of a white or yellow onion'), '~½ of a white or yellow onion');
  for (const v of ['%2 of a white onion', '/2 of a white onion', 'Vz of a white onion', "'/2 of a white onion", '1/z of a white onion']) assert.equal(cleanIngredientLine(v), '~½ of a white onion');
  assert.equal(cleanIngredientLine('%4 cup milk'), '~¼ cup milk');
  assert.equal(cleanIngredientLine('2 cups flour'), '2 cups flour');
  let g = parseIngredient('~½ of a white onion');
  assert.deepEqual([g.quantity, g.name, g.ok], [0.5, 'white onion', false]);
  assert.equal(parseIngredient('½ of an onion').name, 'onion');
  assert.equal(parseIngredient('A pinch of salt').name, 'A pinch of salt');
  assert.equal(cleanIngredientLine('Yams, peeled'), 'Yams, peeled');
  const p = parseIngredient(cleanIngredientLine('Ya cup (60 ml) cooking oil'));
  assert.deepEqual([p.quantity, p.unit, p.ok], [60, 'ml', true]);
  const box = [
    { text: '3 slices Parmesan cheese rind (adds depth of', x0: 10, x1: 600, h: 30 },
    { text: 'flavor, optional', x0: 52, x1: 300, h: 30 },
    { text: '4 sausages (1 pound/455 g) cut into 2-inch', x0: 11, x1: 590, h: 30 },
    { text: '(5-cm) sections', x0: 50, x1: 250, h: 30 }
  ];
  assert.deepEqual(joinIngredientLines([box]), ['3 slices Parmesan cheese rind (adds depth of flavor, optional', '4 sausages (1 pound/455 g) cut into 2-inch (5-cm) sections']);
});

test('a wrapped line placed too far left still joins an open bracket', () => {
  const box = [
    { text: '2 quarts (2 L) broth of choice (see homemade', x0: 10, x1: 600, h: 30 },
    { text: 'options, pages 128-132,', x0: 52, x1: 400, h: 30 },
    { text: 'Or use store-bought)', x0: 12, x1: 300, h: 30 },
    { text: '3-5 tablespoons (50-85 g) tomato paste', x0: 11, x1: 590, h: 30 }
  ];
  assert.deepEqual(joinIngredientLines([box]), ['2 quarts (2 L) broth of choice (see homemade options, pages 128-132, Or use store-bought)', '3-5 tablespoons (50-85 g) tomato paste']);
});

test('one-letter misreads of cooking words are corrected', () => {
  assert.equal(fixSpelling('60 ml cocking oil, coconut, avocado'), '60 ml cooking oil, coconut, avocado');
  assert.equal(fixSpelling('2 gorlic cloves'), '2 garlic cloves');
  assert.equal(fixSpelling('1 zucchmni'), '1 zucchini');
  assert.equal(fixSpelling('broth of chojce'), 'broth of choice');
  assert.equal(fixSpelling('Israeli couscous or mille;'), 'Israeli couscous or millet');
  // Real words and short words are left alone.
  for (const ok of ['Sea salt', '2 large eggs', 'Freshly ground black pepper', '1 lime', 'tomato paste, optional', '3 slices Parmesan cheese rind']) {
    assert.equal(fixSpelling(ok), ok);
  }
});

test('a page footer further left does not swallow the list', () => {
  const box = [
    { text: '¼ cup (60 ml) cooking oil (coconut, avocado,', x0: 120, x1: 700, h: 30 },
    { text: 'or animal fat like lard or butter)', x0: 170, x1: 600, h: 30 },
    { text: 'Sea salt', x0: 121, x1: 260, h: 30 },
    { text: '%2 of a white or yellow onion, roughly chopped', x0: 122, x1: 720, h: 30 },
    { text: '6 medium fresh tomatoes, quartered, with', x0: 120, x1: 640, h: 30 },
    { text: 'seeds left in', x0: 168, x1: 400, h: 30 },
    { text: '4 cloves garlic, roughly chopped', x0: 119, x1: 560, h: 30 },
    { text: '148 the first forty days', x0: 30, x1: 400, h: 30 }
  ];
  const out = joinIngredientLines([box]);
  assert.deepEqual(out.slice(0, 5), ['¼ cup (60 ml) cooking oil (coconut, avocado, or animal fat like lard or butter)', 'Sea salt',
    '~½ of a white or yellow onion, roughly chopped', '6 medium fresh tomatoes, quartered, with seeds left in', '4 cloves garlic, roughly chopped']);
  assert.equal(parseIngredient(out[5]).ok, false);
});
