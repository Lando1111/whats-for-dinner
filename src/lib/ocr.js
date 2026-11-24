// Reading recipe photos on the phone with Tesseract.js (open-source text recognition).
// It runs inside the browser from files this app serves itself (public/ocr), so photos never
// leave the phone and no AI service is involved. The files (about 7 MB) download the first
// time someone reads a photo, then stay cached for offline use.
import { warp, greyFromRGBA, stretch, evenLighting, outputSize } from './imagefix.js';

const MAX_SIDE = 3000;

// A photo the right way up, shrunk to at most 3000 px on its long side, on a canvas.
export async function loadPhoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

// Quarter turn clockwise.
export function rotateQuarter(src) {
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

const pixels = new WeakMap();
function rgbaOf(canvas) {
  if (!pixels.has(canvas)) pixels.set(canvas, canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data);
  return pixels.get(canvas);
}
const greys = new WeakMap();
function greyOf(canvas) {
  if (!greys.has(canvas)) greys.set(canvas, greyFromRGBA(rgbaOf(canvas)));
  return greys.get(canvas);
}

function toCanvas(data, w, h, channels) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const img = new ImageData(w, h);
  if (channels === 4) img.data.set(data);
  else for (let i = 0, j = 0; i < data.length; i++, j += 4) { img.data[j] = img.data[j + 1] = img.data[j + 2] = data[i]; img.data[j + 3] = 255; }
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// The box straightened, in colour (for the dish photo and for checking the text).
export function straighten(photo, quad, { width = 1200 } = {}) {
  const size = outputSize(quad, { target: width, maxScale: 1 });
  return toCanvas(warp(rgbaOf(photo), photo.width, photo.height, 4, quad, size.w, size.h), size.w, size.h, 4);
}

// The box straightened, enlarged, in greyscale with glare or shadow evened out and the contrast boosted, for reading.
export function forReading(photo, quad) {
  const { w, h } = outputSize(quad);
  return toCanvas(stretch(evenLighting(warp(greyOf(photo), photo.width, photo.height, 1, quad, w, h), w, h)), w, h, 1);
}

// Put lines back in reading order, top to bottom, and rejoin a line the reader split in two
// across a wide gap ("3 large handfuls" … "Swiss chard or 1 bunch").
export function byRows(lines) {
  const sorted = [...lines].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = [];
  for (const l of sorted) {
    const mid = (l.y0 + l.y1) / 2;
    const row = rows.find((r) => Math.abs((r.y0 + r.y1) / 2 - mid) < Math.min(r.h, l.h) * 0.5 && (l.x0 >= r.x1 || l.x1 <= r.x0));
    if (!row) { rows.push({ ...l }); continue; }
    const [left, right] = l.x0 < row.x0 ? [l, row] : [row, l];
    Object.assign(row, { text: `${left.text} ${right.text}`, x0: Math.min(l.x0, row.x0), x1: Math.max(l.x1, row.x1), y0: Math.min(l.y0, row.y0), y1: Math.max(l.y1, row.y1) });
  }
  return rows.sort((a, b) => a.y0 - b.y0);
}

let workerPromise = null;
let listener = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      const base = new URL(`${import.meta.env.BASE_URL}ocr`, location.href).href;
      return createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        workerBlobURL: false,
        logger: (m) => listener?.(m)
      });
    })().catch((err) => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

/**
 * Read each box. boxes: [{ kind, quad }]. onProgress({ stage: 'setup' | 'reading', index, total, progress })
 * Returns [{ kind, lines: [{ text, x0, x1, h, confidence }] }] in the same order.
 */
export async function readBoxes(photo, boxes, onProgress = () => {}) {
  let current = { stage: 'setup', index: 0, total: boxes.length, progress: 0 };
  listener = (m) => {
    if (m.status === 'recognizing text') current = { ...current, stage: 'reading', progress: m.progress };
    else if (current.stage === 'setup' && typeof m.progress === 'number') current = { ...current, progress: m.progress };
    onProgress(current);
  };
  onProgress(current);
  const worker = await getWorker();
  const results = [];
  for (let i = 0; i < boxes.length; i++) {
    current = { stage: 'reading', index: i, total: boxes.length, progress: 0 };
    onProgress(current);
    const { kind, quad } = boxes[i];
    await worker.setParameters({ tessedit_pageseg_mode: kind === 'title' ? '6' : '4', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await worker.recognize(forReading(photo, quad), {}, { text: true, blocks: true });
    const lines = [];
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          const text = (line.text || '').replace(/\s+/g, ' ').trim();
          if (text) lines.push({ text, x0: line.bbox.x0, x1: line.bbox.x1, y0: line.bbox.y0, y1: line.bbox.y1, h: line.bbox.y1 - line.bbox.y0 });
        }
      }
    }
    if (!lines.length && data.text) for (const t of data.text.split('\n')) if (t.trim()) lines.push({ text: t.trim() });
    results.push({ kind, lines: lines[0]?.y0 != null ? byRows(lines) : lines });
  }
  listener = null;
  return results;
}

// Free the memory text recognition uses (about 100 MB) when the person is done.
export async function stopReading() {
  if (!workerPromise) return;
  const p = workerPromise;
  workerPromise = null;
  try { (await p).terminate(); } catch { /* already gone */ }
}
