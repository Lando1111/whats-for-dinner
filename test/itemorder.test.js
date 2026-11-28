import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byPlace, placeItem, moveTo } from '../src/lib/itemorder.js';

const it = (id, sort_key = null, created_at = id) => ({ id, sort_key, created_at });

test('placed items first, then new ones oldest first', () => {
  const list = [it('c'), it('a', 2048), it('b'), it('d', 1024)].sort(byPlace);
  assert.deepEqual(list.map((x) => x.id), ['d', 'a', 'b', 'c']);
});

test('first drag numbers the whole section', () => {
  const order = [it('b'), it('a'), it('c')];
  assert.deepEqual(placeItem(order, 'b'), [{ id: 'b', sort_key: 1024 }, { id: 'a', sort_key: 2048 }, { id: 'c', sort_key: 3072 }]);
});

test('later drags change one item', () => {
  assert.deepEqual(placeItem([it('a', 1024), it('x', 5000), it('b', 2048)], 'x'), [{ id: 'x', sort_key: 1536 }]);
  assert.deepEqual(placeItem([it('x', 5000), it('a', 1024)], 'x'), [{ id: 'x', sort_key: 0 }]);
  assert.deepEqual(placeItem([it('a', 1024), it('x')], 'x'), [{ id: 'x', sort_key: 2048 }]);
  assert.deepEqual(placeItem([it('x', 7)], 'x'), [{ id: 'x', sort_key: 1024 }]);
});

test('moving within a list', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
  assert.deepEqual(moveTo(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b']);
  assert.deepEqual(moveTo(['a', 'b'], 'z', 1), ['a', 'z', 'b']);
});
