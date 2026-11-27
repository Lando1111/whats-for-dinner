import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easterSunday, shroveTuesday, specialDay, headerTitle, pizzaHat, secretWord, lastYearIso, anniversary, earnedTrophies, easterEggDates } from '../src/lib/eggs.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const at = (s) => new Date(s); // local time

test('Easter and Shrove Tuesday dates', () => {
  assert.equal(iso(easterSunday(2026)), '2026-04-05');
  assert.equal(iso(easterSunday(2027)), '2027-03-28');
  assert.equal(iso(easterSunday(2028)), '2028-04-16');
  assert.equal(iso(shroveTuesday(2027)), '2027-02-09');
});

test('special days', () => {
  assert.equal(specialDay(at('2027-04-01T12:00')), 'april_fools');
  assert.equal(specialDay(at('2026-10-31T12:00')), 'halloween');
  assert.equal(specialDay(at('2026-12-25T12:00')), 'christmas');
  assert.equal(specialDay(at('2027-03-26T12:00')), 'easter'); // Good Friday
  assert.equal(specialDay(at('2027-03-29T12:00')), 'easter'); // Easter Monday
  assert.equal(specialDay(at('2027-03-30T12:00')), null);
  assert.equal(specialDay(at('2027-02-09T12:00')), 'shrove');
  assert.equal(specialDay(at('2026-11-27T12:00')), null);
});

test('titles and hats follow the day and time', () => {
  assert.equal(headerTitle(at('2026-11-27T18:00')), "What's for Dinner?");
  assert.equal(headerTitle(at('2026-11-27T23:30')), "What's for… midnight snack?");
  assert.equal(headerTitle(at('2026-11-28T03:59')), "What's for… midnight snack?");
  assert.equal(headerTitle(at('2026-11-28T04:00')), "What's for Dinner?");
  assert.equal(headerTitle(at('2027-04-01T09:00')), "What's for Dessert?");
  assert.equal(headerTitle(at('2026-12-25T09:00')), "What's for Christmas lunch?");
  assert.equal(pizzaHat(at('2026-10-31T18:00')), 'pumpkin');
  assert.equal(pizzaHat(at('2026-12-24T18:00')), 'santa');
  assert.equal(pizzaHat(at('2026-12-01T08:00')), 'santa');
  assert.equal(pizzaHat(at('2026-12-25T23:30')), 'santa');
  assert.equal(pizzaHat(at('2026-12-26T18:00')), null);
  assert.equal(pizzaHat(at('2026-11-30T18:00')), null);
  assert.equal(pizzaHat(at('2026-11-27T23:30')), 'nightcap');
  assert.equal(pizzaHat(at('2026-11-27T18:00')), null);
});

test('secret words are matched loosely and nothing else is', () => {
  assert.equal(secretWord('Make it rain!'), 'rain');
  assert.equal(secretWord('  ABRACADABRA '), 'shuffle');
  assert.equal(secretWord('pizza party'), 'pizza');
  assert.equal(secretWord('pizza'), null);
  assert.equal(secretWord('2 L milk'), null);
});

test('last year is the same weekday', () => {
  assert.equal(lastYearIso('2027-11-26'), '2026-11-27');
  assert.equal(new Date(2026, 10, 27).getDay(), new Date(2027, 10, 26).getDay());
});

test('anniversary shows for three days from the first year', () => {
  const made = '2026-11-24T01:00:00Z';
  assert.equal(anniversary(made, at('2026-11-25T12:00')), 0);
  assert.equal(anniversary(made, at('2027-11-24T12:00')), 1);
  assert.equal(anniversary(made, at('2027-11-26T12:00')), 1);
  assert.equal(anniversary(made, at('2027-11-27T12:00')), 0);
  assert.equal(anniversary(made, at('2028-11-24T12:00')), 2);
});

test('Easter eggs go on four different tiles', () => {
  const week = ['2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26', '2027-03-27', '2027-03-28'];
  const picks = easterEggDates(week, 2027);
  assert.equal(picks.length, 4);
  assert.equal(new Set(picks).size, 4);
  assert.deepEqual(easterEggDates(week, 2027), picks);
});

test('trophies come from the plan', () => {
  const week = (mon, kind = 'cook', extra = {}) => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(d.getDate() + i);
    return { date: iso(d), kind, recipe_id: kind === 'cook' ? `r${i % 5}` : null, multiplier: 1, ...extra };
  });
  const recipes = ['beef', 'chicken', 'lamb', 'pork', 'vegetarian'].map((protein, i) => ({ id: `r${i}`, protein }));
  assert.deepEqual([...earnedTrophies({})], []);
  const one = earnedTrophies({ plan: week(at('2026-11-23T00:00')), recipes });
  assert.ok(one.has('first') && one.has('full_week') && one.has('variety'));
  assert.ok(!one.has('streak4'));
  const four = [0, 7, 14, 21].flatMap((n) => week(new Date(2026, 10, 23 + n)));
  assert.ok(earnedTrophies({ plan: four, recipes }).has('streak4'));
  const gap = [0, 7, 21, 28].flatMap((n) => week(new Date(2026, 10, 23 + n)));
  assert.ok(!earnedTrophies({ plan: gap, recipes }).has('streak4'));
  const veg = [{ date: '2026-11-23', kind: 'cook', recipe_id: 'r4' }, { date: '2026-11-24', kind: 'cook', recipe_id: 'r4' }, { date: '2026-11-25', kind: 'cook', recipe_id: 'r4' }];
  assert.ok(earnedTrophies({ plan: veg, recipes }).has('veg3'));
  assert.ok(earnedTrophies({ plan: week(at('2026-11-23T00:00'), 'leftovers').concat(week(at('2026-11-30T00:00'), 'leftovers')) }).has('leftovers10'));
  assert.ok(earnedTrophies({ createdAt: '2025-11-01T00:00:00Z', now: at('2026-11-27T12:00') }).has('year'));
});
