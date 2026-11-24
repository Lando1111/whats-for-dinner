import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nightFit, pickRecipe } from '../src/lib/plan.js';

const r = (id, occasions = [], extra = {}) => ({ id, title: id, meal_type: 'dinner', seasons: ['all'], occasions, ...extra });
const MON = '2026-11-23'; const SAT = '2026-11-28'; const FRI = '2026-11-27';

test('weeknight and weekend recipes suit the right nights', () => {
  assert.equal(nightFit(r('a', ['weeknight']), MON), 'fits');
  assert.equal(nightFit(r('a', ['weeknight']), SAT), 'clashes');
  assert.equal(nightFit(r('b', ['weekend']), SAT), 'fits');
  assert.equal(nightFit(r('c', ['slow_cook']), SAT), 'fits');
  assert.equal(nightFit(r('c', ['slow_cook']), MON), 'clashes');
  assert.equal(nightFit(r('d', ['hosting']), MON), 'any');
  assert.equal(nightFit(r('e', ['weeknight', 'weekend']), SAT), 'fits');
  assert.equal(nightFit(r('b', ['weekend']), FRI, [5, 6, 0]), 'fits'); // Friday counted as weekend in Settings
});

test('Surprise me prefers recipes that suit the night, then untagged ones', () => {
  const recipes = [r('quick', ['weeknight']), r('roast', ['weekend']), r('stew', ['slow_cook']), r('any')];
  for (let i = 0; i < 20; i++) {
    assert.equal(pickRecipe(recipes, { date: MON }).id, 'quick');
    assert.ok(['roast', 'stew'].includes(pickRecipe(recipes, { date: SAT }).id));
    assert.equal(pickRecipe(recipes, { date: MON, avoid: new Set(['quick']) }).id, 'any');
    assert.equal(pickRecipe(recipes, { date: SAT, avoid: new Set(['roast', 'stew']) }).id, 'any');
  }
});
