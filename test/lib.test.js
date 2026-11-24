import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, parseNumber, parseMethod } from '../src/lib/parse.js';
import { convertLine, formatAmount, formatQty, fahrenheitToCelsius, formatOriginal } from '../src/lib/units.js';
import { guessSection } from '../src/lib/sections.js';

const conv = (line, o) => formatAmount(convertLine(line, o));

test('numbers', () => {
  assert.equal(parseNumber('1 1/2'), 1.5);
  assert.equal(parseNumber('1½'), 1.5);
  assert.equal(parseNumber('½'), 0.5);
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(formatQty(1.5), '1½');
  assert.equal(formatQty(0.333), '⅓');
  assert.equal(formatQty(2), '2');
});

test('ingredient lines', () => {
  assert.deepEqual(parseIngredient('1 ½ cups plain flour, sifted'), { quantity: 1.5, unit: 'cup', name: 'plain flour', note: 'sifted', ok: true });
  assert.deepEqual(parseIngredient('500g beef mince'), { quantity: 500, unit: 'g', name: 'beef mince', note: null, ok: true });
  assert.deepEqual(parseIngredient('2 x 400 g tins kidney beans, drained'), { quantity: 2, unit: 'tin', name: 'kidney beans', note: '400 g, drained', ok: true });
  assert.deepEqual(parseIngredient('1 brown onion, diced'), { quantity: 1, unit: null, name: 'brown onion', note: 'diced', ok: true });
  assert.deepEqual(parseIngredient('2 garlic cloves (crushed)'), { quantity: 2, unit: null, name: 'garlic cloves', note: 'crushed', ok: true });
  assert.deepEqual(parseIngredient('3 cloves garlic'), { quantity: 3, unit: 'clove', name: 'garlic', note: null, ok: true });
  assert.deepEqual(parseIngredient('Salt and pepper, to taste'), { quantity: null, unit: null, name: 'Salt and pepper', note: 'to taste', ok: true });
  assert.equal(parseIngredient('11/2 cup5 chicken stock').ok, false);
  assert.equal(parseIngredient('1-2 tbsp chilli flakes').note, '1–2');
  assert.equal(parseIngredient('- 2 tbsp olive oil').unit, 'tbsp');
});

test('method', () => {
  assert.deepEqual(parseMethod('1. Heat oil.\n2. Add onion.'), ['Heat oil.', 'Add onion.']);
});

test('conversion: AU defaults', () => {
  assert.equal(conv({ quantity: 1, unit: 'cup', name: 'plain flour' }), '150 g');
  assert.equal(conv({ quantity: 1, unit: 'cup', name: 'milk' }), '250 ml');
  assert.equal(conv({ quantity: 2, unit: 'tbsp', name: 'olive oil' }), '2 tbsp');
  assert.equal(conv({ quantity: 500, unit: 'g', name: 'beef mince' }), '500 g');
  assert.equal(conv({ quantity: 500, unit: 'g', name: 'beef mince' }, { multiplier: 2 }), '1 kg');
});

test('conversion: US recipes', () => {
  assert.equal(conv({ quantity: 1, unit: 'cup', name: 'beef stock' }, { system: 'US' }), '235 ml');
  assert.equal(conv({ quantity: 0.5, unit: 'cup', name: 'greek yoghurt' }), '125 ml');
  assert.equal(conv({ quantity: 2, unit: 'tbsp', name: 'chilli powder' }, { system: 'US' }), '1½ tbsp');
  assert.equal(conv({ quantity: 1, unit: 'lb', name: 'chicken thighs' }, { system: 'US' }), '450 g');
  assert.equal(conv({ quantity: 1, unit: 'cup', name: 'white sugar' }, { system: 'US' }), '210 g');
  assert.equal(formatOriginal({ quantity: 2, unit: 'tbsp' }, 1, 'US'), '2 US tbsp');
});

test('conversion: cups preference', () => {
  assert.equal(conv({ quantity: 300, unit: 'ml', name: 'milk' }, { prefs: { liquid: 'cup' } }), '1¼ cups');
  assert.equal(conv({ quantity: 1, unit: 'cup', name: 'plain flour' }, { prefs: { dry: 'cup' } }), '1 cup');
  assert.equal(conv({ quantity: 2, unit: null, name: 'brown onion' }, { multiplier: 2 }), '4');
});

test('temperatures', () => {
  assert.equal(fahrenheitToCelsius('Bake at 350°F for 20 min'), 'Bake at 180°C (350°F) for 20 min');
});

test('sections', () => {
  assert.equal(guessSection('brown onions'), 'fruit_veg');
  assert.equal(guessSection('tinned tomatoes'), 'pantry');
  assert.equal(guessSection('eggplant'), 'fruit_veg');
  assert.equal(guessSection('eggs'), 'fridge');
  assert.equal(guessSection('unsalted butter'), 'fridge');
  assert.equal(guessSection('frozen peas'), 'frozen');
  assert.equal(guessSection('beef mince'), 'meat_seafood');
  assert.equal(guessSection('chicken stock'), 'pantry');
  assert.equal(guessSection('butternut pumpkin'), 'fruit_veg');
  assert.equal(guessSection('sourdough bread'), 'bakery');
  assert.equal(guessSection('dishwashing liquid'), 'household');
});

import { guessProtein } from '../src/lib/parse.js';
test('protein guess', () => {
  assert.equal(guessProtein(['beef mince', 'onion']), 'beef');
  assert.equal(guessProtein(['chicken thighs']), 'chicken');
  assert.equal(guessProtein(['rice', 'frozen peas', 'eggs']), 'vegetarian');
  assert.equal(guessProtein(['hamburger buns', 'mushrooms']), 'vegetarian');
});

test('website lines: notes inside brackets, brackets in brackets, two units', async () => {
  const { parseIngredient, tidyLine } = await import('../src/lib/parse.js');
  const cases = [
    ['600 g/1.2lb chicken breast ((or thigh))', 600, 'g', 'chicken breast', '1.2 lb, or thigh'],
    ['2 cups milk (, any fat % (Note 1))', 2, 'cup', 'milk', 'any fat %'],
    ['2 sprigs thyme (, optional)', 2, 'sprig', 'thyme', 'optional'],
    ['1 large onion (, chopped)', 1, null, 'large onion', 'chopped'],
    ['1.2lb/600g chicken thigh', 600, 'g', 'chicken thigh', '1.2 lb'],
    ['500ml / 2 cups stock', 500, 'ml', 'stock', '2 cups'],
    ['1 sheet puff pastry (, thawed (Note 3))', 1, 'sheet', 'puff pastry', 'thawed']
  ];
  for (const [line, q, u, name, note] of cases) {
    const p = parseIngredient(line);
    assert.deepEqual([p.quantity, p.unit, p.name, p.note, p.ok], [q, u, name, note, true], line);
  }
  assert.equal(tidyLine('2 tsp salt &#x28;or to taste&#x29;'), '2 tsp salt (or to taste)');
  assert.equal(parseIngredient('1/2 cup flour').quantity, 0.5);
});
