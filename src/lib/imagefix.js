// Image clean-up for reading recipe photos: straighten a four-corner box into a flat rectangle
// and boost its contrast. Plain maths on pixel arrays, no libraries.

/**
 * 3×3 perspective transform taking output pixel (x, y) in a w×h rectangle to the source photo,
 * where quad = [topLeft, topRight, bottomRight, bottomLeft] as [x, y] in source pixels.
 */
export function homography(quad, w, h) {
  const dst = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i];
    const [u, v] = quad[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
  }
  const hv = solve(A, b);
  return [...hv, 1];
}

// Gaussian elimination with partial pivoting.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) throw new Error('That box is too thin to straighten.');
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Size of the straightened rectangle: the box's own size, enlarged when small so text is big
// enough to read (about 1,800 px wide), and kept under about 8 million pixels.
export function outputSize(quad, { target = 1800, maxScale = 2.5, maxPixels = 8e6 } = {}) {
  const w0 = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  const h0 = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  let s = Math.min(maxScale, Math.max(1, target / w0));
  if (w0 * h0 * s * s > maxPixels) s = Math.sqrt(maxPixels / (w0 * h0));
  return { w: Math.max(1, Math.round(w0 * s)), h: Math.max(1, Math.round(h0 * s)) };
}

/**
 * Straighten: sample the source (channels per pixel: 1 for grey, 4 for RGBA) through the
 * perspective transform with bilinear smoothing. Outside the photo is white.
 */
export function warp(src, sw, sh, channels, quad, w, h) {
  const H = homography(quad, w, h);
  const out = new Uint8ClampedArray(w * h * channels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = H[6] * x + H[7] * y + 1;
      const u = (H[0] * x + H[1] * y + H[2]) / d;
      const v = (H[3] * x + H[4] * y + H[5]) / d;
      const o = (y * w + x) * channels;
      if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) {
        for (let c = 0; c < channels; c++) out[o + c] = 255;
        continue;
      }
      const x0 = Math.floor(u); const y0 = Math.floor(v);
      const x1 = Math.min(x0 + 1, sw - 1); const y1 = Math.min(y0 + 1, sh - 1);
      const fx = u - x0; const fy = v - y0;
      const i00 = (y0 * sw + x0) * channels; const i10 = (y0 * sw + x1) * channels;
      const i01 = (y1 * sw + x0) * channels; const i11 = (y1 * sw + x1) * channels;
      for (let c = 0; c < channels; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
        const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
        out[o + c] = top + (bot - top) * fy;
      }
    }
  }
  return out;
}

export function greyFromRGBA(rgba) {
  const g = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return g;
}

/**
 * Stretch contrast so the darkest 1% of pixels become black and the lightest 1% white.
 * (Tested on real photos: this reads better than converting to pure black-and-white.)
 */
export function stretch(grey, cut = 0.01) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < grey.length; i++) hist[grey[i]]++;
  const n = grey.length * cut;
  let lo = 0; let hi = 255; let acc = 0;
  while (lo < 255 && (acc += hist[lo]) <= n) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) <= n) hi--;
  if (hi <= lo) return grey;
  const out = new Uint8ClampedArray(grey.length);
  const k = 255 / (hi - lo);
  for (let i = 0; i < grey.length; i++) out[i] = (grey[i] - lo) * k;
  return out;
}
