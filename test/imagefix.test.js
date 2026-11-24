import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homography, warp, stretch, outputSize } from '../src/lib/imagefix.js';

const apply = (H, x, y) => { const d = H[6] * x + H[7] * y + 1; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };

test('perspective transform hits the four corners', () => {
  const quad = [[100, 50], [700, 90], [760, 900], [80, 860]];
  const H = homography(quad, 400, 600);
  const got = [[0, 0], [400, 0], [400, 600], [0, 600]].map(([x, y]) => apply(H, x, y).map((n) => Math.round(n)));
  assert.deepEqual(got, quad);
});

test('straightening an upright box copies it', () => {
  const sw = 4; const sh = 3;
  const src = Uint8ClampedArray.from([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
  const out = warp(src, sw, sh, 1, [[1, 0], [3, 0], [3, 2], [1, 2]], 2, 2);
  assert.deepEqual([...out], [10, 20, 50, 60]);
});

test('contrast stretch spreads a washed-out photo to full range', () => {
  const g = new Uint8ClampedArray(1000);
  for (let i = 0; i < g.length; i++) g[i] = 100 + (i % 101); // values 100–200
  const s = stretch(g);
  assert.ok(Math.min(...s) <= 3 && Math.max(...s) >= 252);
});

test('small boxes are enlarged for reading', () => {
  assert.deepEqual(outputSize([[0, 0], [600, 0], [600, 800], [0, 800]]), { w: 1500, h: 2000 });
  assert.deepEqual(outputSize([[0, 0], [2000, 0], [2000, 1000], [0, 1000]]), { w: 2000, h: 1000 });
});
