import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedSections } from '../src/lib/prefs.js';

test("aisle order: the person's order first, anything unplaced after in Coles' order", () => {
  const ids = orderedSections(['frozen', 'pantry']).map((s) => s.id);
  assert.deepEqual(ids.slice(0, 4), ['frozen', 'pantry', 'fruit_veg', 'meat_seafood']);
  assert.equal(ids.length, 16);
  assert.deepEqual(orderedSections([]).map((s) => s.id).slice(0, 3), ['fruit_veg', 'meat_seafood', 'fridge']);
});
