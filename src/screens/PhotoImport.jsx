// Read a recipe from photos: drag four corners around each part of the page, then the phone
// reads the text itself (Tesseract.js). A recipe can run over several pages: boxes belong to the
// page they're drawn on and are read in page order. Nothing is uploaded until the recipe is saved.
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadPhoto, rotateQuarter, straighten, readBoxes, stopReading } from '../lib/ocr.js';
import { joinIngredientLines, joinMethodLines, findServings, tidyTitle, guessSystem } from '../lib/ocrtext.js';
import { Icon } from '../icons.jsx';
import { PickPhoto } from '../PickPhoto.jsx';

export const MAX_PAGES = 4; // each page is a big image in the phone's memory

const STEPS = [
  { key: 'ingredients', title: 'Ingredients', prompt: 'Drag the corners to fit around the ingredients. If they run into a second column or onto another page, add another box.', many: true },
  { key: 'method', title: 'Method', prompt: 'Now the method. Add a box for each column or panel, in reading order.', many: true, optional: true },
  { key: 'title', title: 'Name', prompt: "Box the recipe's name, or skip and type it in.", optional: true },
  { key: 'photo', title: 'Dish photo', prompt: 'Box the picture of the dish to use as the recipe photo.', optional: true }
];
const KEYS = STEPS.map((s) => s.key);
const emptyBoxes = () => Object.fromEntries(KEYS.map((k) => [k, []]));

function defaultQuad(w, h, existing) {
  // Side by side when there's already a box on this page: left half, then right half.
  const n = existing.length;
  const x0 = n === 0 ? 0.15 : n % 2 ? 0.52 : 0.08;
  const x1 = n === 0 ? 0.85 : n % 2 ? 0.92 : 0.48;
  return [[x0 * w, 0.22 * h], [x1 * w, 0.22 * h], [x1 * w, 0.78 * h], [x0 * w, 0.78 * h]];
}

const inside = (pt, q) => {
  let c = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = q[i]; const [xj, yj] = q[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// Boxes from an older single-photo read were plain corner lists; they belong to page 1.
const asBoxes = (b) => Object.fromEntries(KEYS.map((k) => [k, (b?.[k] || []).map((x) => (Array.isArray(x) ? { page: 0, q: x } : x))]));
// Reading order: page by page, then the order the boxes were drawn.
const inOrder = (list) => list.map((b, i) => [b, i]).sort((a, z) => a[0].page - z[0].page || a[1] - z[1]);

// files: one or more photos. only: read just one section again ('ingredients' or 'method').
// start: { files, rotations, boxes } from the last read, so the boxes can be adjusted rather than drawn again.
export function PhotoImport({ file, files, onDone, onCancel, only = null, start = null }) {
  const steps = only ? STEPS.filter((s) => s.key === only).map((s) => ({ ...s, optional: false })) : STEPS;
  const [pages, setPages] = useState([]); // { file, photo, src, rotations }
  const [page, setPage] = useState(0);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(0);
  const [boxes, setBoxes] = useState(() => asBoxes(start?.boxes));
  const [active, setActive] = useState(0); // index into this step's boxes
  const [reading, setReading] = useState(null);
  const [scale, setScale] = useState(1);
  const svgRef = useRef();
  const drag = useRef(null);
  const urls = useRef([]);

  async function openPage(f, rotations = 0) {
    let c = await loadPhoto(f);
    for (let i = 0; i < rotations; i++) c = rotateQuarter(c);
    return { file: f, photo: c, rotations, src: await srcOf(c) };
  }
  function srcOf(c) {
    return new Promise((res) => c.toBlob((b) => { const u = URL.createObjectURL(b); urls.current.push(u); res(u); }, 'image/jpeg', 0.85));
  }

  // Open the photos (right way up).
  useEffect(() => {
    let gone = false;
    const list = (start?.files || files || [file]).filter(Boolean).slice(0, MAX_PAGES);
    const rot = Array.isArray(start?.rotations) ? start.rotations : [start?.rotations || 0];
    Promise.all(list.map((f, i) => openPage(f, rot[i] || 0)))
      .then((ps) => { if (!gone) setPages(ps); })
      .catch(() => setErr("Couldn't open that photo. Try another one."));
    return () => { gone = true; };
  }, []);
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); stopReading(); }, []);

  const cur = steps[step];
  const list = boxes[cur.key];
  const pg = pages[page];
  const photo = pg?.photo;
  const here = list.map((b, i) => [b, i]).filter(([b]) => b.page === page);
  const order = inOrder(list).map(([, i]) => i); // box index → reading position

  // Every step starts with one box, on the page being looked at.
  useEffect(() => {
    if (photo && !boxes[cur.key].length) {
      setBoxes((b) => ({ ...b, [cur.key]: [{ page, q: defaultQuad(photo.width, photo.height, []) }] }));
      setActive(0);
    }
  }, [photo, step]);

  // Handles stay the same size on screen whatever the photo's size.
  function measure() {
    const el = svgRef.current;
    const w = el && el.getBoundingClientRect().width;
    if (photo && w > 0) setScale(photo.width / w);
  }
  useEffect(() => { measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, [photo]);

  function toImage(e) {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [Math.max(0, Math.min(photo.width, p.x)), Math.max(0, Math.min(photo.height, p.y))];
  }

  function down(e, boxIndex, corner) {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current.setPointerCapture(e.pointerId);
    setActive(boxIndex);
    drag.current = { boxIndex, corner, start: toImage(e), quad: list[boxIndex].q.map((p) => [...p]) };
  }
  function downOnPhoto(e) {
    const pt = toImage(e);
    for (let k = here.length - 1; k >= 0; k--) if (inside(pt, here[k][0].q)) return down(e, here[k][1], null);
    return undefined;
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    const pt = toImage(e);
    const q = d.quad.map((p) => [...p]);
    if (d.corner != null) q[d.corner] = pt;
    else {
      const dx = pt[0] - d.start[0]; const dy = pt[1] - d.start[1];
      for (const p of q) { p[0] = Math.max(0, Math.min(photo.width, p[0] + dx)); p[1] = Math.max(0, Math.min(photo.height, p[1] + dy)); }
    }
    setBoxes((b) => ({ ...b, [cur.key]: b[cur.key].map((x, i) => (i === d.boxIndex ? { ...x, q } : x)) }));
  }
  function up() { drag.current = null; }

  function addBox() {
    const onPage = list.filter((b) => b.page === page).map((b) => b.q);
    setBoxes((b) => ({ ...b, [cur.key]: [...b[cur.key], { page, q: defaultQuad(photo.width, photo.height, onPage) }] }));
    setActive(list.length);
  }
  // Name and dish photo have one box: move it to this page.
  function boxHere() {
    setBoxes((b) => ({ ...b, [cur.key]: [{ page, q: defaultQuad(photo.width, photo.height, []) }] }));
    setActive(0);
  }
  function removeBox() {
    setBoxes((b) => ({ ...b, [cur.key]: b[cur.key].filter((_, i) => i !== active) }));
    setActive(0);
  }

  function showPage(n) {
    setPage(n);
    const first = list.findIndex((b) => b.page === n);
    if (first >= 0) setActive(first);
  }
  async function addPages(fs) {
    const room = MAX_PAGES - pages.length;
    if (room <= 0) return setErr(`Up to ${MAX_PAGES} pages at a time.`);
    setErr(fs.length > room ? `Only the first ${room} added: up to ${MAX_PAGES} pages at a time.` : null);
    try {
      const added = await Promise.all(fs.slice(0, room).map((f) => openPage(f)));
      const at = pages.length;
      setPages((ps) => [...ps, ...added]);
      setPage(at);
    } catch { setErr("Couldn't open that photo. Try another one."); }
  }
  function removePage() {
    const n = page;
    setPages((ps) => ps.filter((_, i) => i !== n));
    setBoxes((b) => Object.fromEntries(KEYS.map((k) => [k, b[k].filter((x) => x.page !== n).map((x) => (x.page > n ? { ...x, page: x.page - 1 } : x))])));
    setPage(Math.max(0, n - 1));
    setActive(0);
  }
  function rotate() {
    const n = page;
    const c = rotateQuarter(photo);
    srcOf(c).then((src) => setPages((ps) => ps.map((p, i) => (i === n ? { ...p, photo: c, src, rotations: (p.rotations + 1) % 4 } : p))));
    // The boxes on this page no longer fit it; this step gets a fresh one.
    setBoxes((b) => {
      const kept = Object.fromEntries(KEYS.map((k) => [k, b[k].filter((x) => x.page !== n)]));
      return { ...kept, [cur.key]: [...kept[cur.key], { page: n, q: defaultQuad(c.width, c.height, []) }] };
    });
    setActive(boxes[cur.key].filter((x) => x.page !== n).length);
  }

  function next(skip) {
    if (skip) setBoxes((b) => ({ ...b, [cur.key]: [] }));
    if (step < steps.length - 1) {
      setStep(step + 1);
      const nk = steps[step + 1].key;
      const first = boxes[nk].findIndex((b) => b.page === page);
      setActive(first >= 0 ? first : 0);
      if (boxes[nk].length && first < 0) setPage(boxes[nk][0].page);
      return;
    }
    const all = skip ? { ...boxes, [cur.key]: [] } : boxes;
    read(only ? { ...emptyBoxes(), [only]: all[only] } : all);
  }

  async function read(all) {
    const job = (kind) => inOrder(all[kind]).map(([b]) => ({ kind, quad: b.q, photo: pages[b.page].photo }));
    const jobs = [...job('ingredients'), ...job('method'), ...job('title')];
    if (!jobs.length) { setErr('Box at least the ingredients so there is something to read.'); return; }
    setReading({ stage: 'setup', index: 0, total: jobs.length, progress: 0 });
    try {
      const results = await readBoxes(null, jobs, setReading);
      const of = (kind) => results.filter((r) => r.kind === kind).map((r) => r.lines);
      const allText = results.flatMap((r) => r.lines.map((l) => l.text)).join('\n');
      const preview = (kind) => inOrder(all[kind]).map(([b]) => straighten(pages[b.page].photo, b.q, { width: 900 }).toDataURL('image/jpeg', 0.8));
      let dish = null;
      if (all.photo.length) { const b = all.photo[0]; dish = await new Promise((res) => straighten(pages[b.page].photo, b.q, { width: 1600 }).toBlob(res, 'image/jpeg', 0.9)); }
      await stopReading();
      onDone({
        title: of('title').map((lines) => tidyTitle(lines.map((l) => l.text).join(' '))).filter(Boolean)[0] || '',
        ingredients: joinIngredientLines(of('ingredients')),
        method: joinMethodLines(of('method')),
        servings: findServings(allText),
        system: guessSystem(allText),
        dish,
        previews: { ingredients: preview('ingredients'), method: preview('method') },
        only,
        again: { files: pages.map((p) => p.file), rotations: pages.map((p) => p.rotations), boxes: only ? { [only]: all[only] } : all }
      });
    } catch (e) {
      console.error(e);
      setReading(null);
      setErr(navigator.onLine ? "Couldn't read the photo. Try again, or use Paste a list." : 'Reading photos needs a one-off download first. Connect to the internet and try again.');
    }
  }

  const pct = reading ? Math.round((reading.progress || 0) * 100) : 0;
  const r = 22 * scale;
  const many = pages.length > 1;

  return (
    <div class="scrim">
      <section class="sheet full photo-import" role="dialog" aria-label="Read a recipe photo">
        <header class="row-head" style="gap:4px;padding:8px 12px 0">
          <button class="icon-btn" aria-label="Cancel" onClick={onCancel}><Icon name="close" /></button>
          <h2 class="title" style="font-size:20px;margin:0">{reading ? 'Reading the recipe' : cur.title}</h2>
          {!reading && steps.length > 1 && <span class="cap" style="margin-left:auto">Step {step + 1} of {steps.length}</span>}
        </header>

        {err && <p class="cap" role="alert" style="margin:0 16px;color:var(--beet);font-weight:600">{err}</p>}

        {reading ? (
          <div style="padding:24px 16px;display:flex;flex-direction:column;gap:12px">
            <p style="margin:0;font-weight:700">
              {reading.stage === 'setup' ? 'Getting ready…' : `Reading box ${reading.index + 1} of ${reading.total}`}
            </p>
            <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><span style={`width:${pct}%`} /></div>
            <p class="cap" style="margin:0">
              {reading.stage === 'setup' ? 'The first time only, the phone downloads its text reader (about 7 MB). After that it works offline.' : 'Everything happens on this phone. Nothing is sent anywhere.'}
            </p>
          </div>
        ) : (
          <>
            <p class="cap" style="margin:0 16px">
              {cur.prompt}{step === 0 && !many && ' Tip: press the page flat and take the photo from straight above.'}
              {photo && !here.length && (cur.many ? ` No ${cur.title.toLowerCase()} box on this page yet.` : ` The box is on page ${(list[0]?.page ?? 0) + 1}.`)}
            </p>
            <div class="pages" role="group" aria-label="Pages">
              {pages.map((p, i) => {
                const n = list.filter((b) => b.page === i).length;
                return (
                  <button class="chipbtn" aria-pressed={i === page ? 'true' : 'false'} onClick={() => showPage(i)}>
                    Page {i + 1}{n ? <span class="count">{n}</span> : null}
                  </button>
                );
              })}
              {pages.length > 0 && pages.length < MAX_PAGES && (
                <PickPhoto class="chipbtn add" title="Add a page" label="Add a page" onFile={(f) => addPages([f])} onFiles={addPages} />
              )}
            </div>
            <div class="photo-stage">
              {!pg?.src ? <p class="cap">Opening the photo…</p> : (
                <div class="photo-wrap">
                  <img src={pg.src} alt={`Your recipe photo, page ${page + 1}`} onLoad={measure} />
                  <svg ref={svgRef} viewBox={`0 0 ${photo.width} ${photo.height}`} preserveAspectRatio="none"
                    onPointerDown={downOnPhoto} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                    {steps.filter((s) => s.key !== cur.key).flatMap((s) => boxes[s.key].filter((b) => b.page === page).map((b) => (
                      <polygon points={b.q.map((p) => p.join(',')).join(' ')} class="quad other" style={`stroke-width:${2 * scale}`} />
                    )))}
                    {/* The box being edited is drawn last so its corners sit on top. */}
                    {[...here].sort((a, b) => (a[1] === active) - (b[1] === active)).map(([b, i]) => (
                      <g key={i} class={i === active ? 'quad-g on' : 'quad-g'}>
                        <polygon points={b.q.map((p) => p.join(',')).join(' ')} class="quad" style={`stroke-width:${3 * scale}`} />
                        {list.length > 1 && <text x={(b.q[0][0] + b.q[2][0]) / 2} y={(b.q[0][1] + b.q[2][1]) / 2} font-size={28 * scale} class="quad-num">{order.indexOf(i) + 1}</text>}
                        {i === active && b.q.map((p, c) => (
                          <g class="corner" onPointerDown={(e) => down(e, i, c)} aria-label={`Corner ${c + 1}`}>
                            <circle cx={p[0]} cy={p[1]} r={r} class="corner-hit" />
                            <circle cx={p[0]} cy={p[1]} r={r * 0.6} class="corner-ring" style={`stroke-width:${3 * scale}`} />
                            <circle cx={p[0]} cy={p[1]} r={3 * scale} class="corner-dot" />
                          </g>
                        ))}
                      </g>
                    ))}
                  </svg>
                </div>
              )}
            </div>
            <div class="row-head" style="gap:8px;padding:0 16px;flex-wrap:wrap">
              {cur.many && <button class="btn outline sm" onClick={addBox} disabled={!photo}><Icon name="plus" size={18} />{here.length ? 'Add another box' : 'Add a box here'}</button>}
              {!cur.many && photo && !here.length && <button class="btn outline sm" onClick={boxHere}><Icon name="plus" size={18} />Box it on this page</button>}
              {list.length > 1 && here.some(([, i]) => i === active) && <button class="btn outline sm" onClick={removeBox}><Icon name="trash" size={18} />Remove box {order.indexOf(active) + 1}</button>}
              {!only && !KEYS.some((k) => k !== cur.key && boxes[k].some((b) => b.page === page)) && <button class="btn outline sm" onClick={rotate} disabled={!photo}><Icon name="rotate" size={18} />Turn photo</button>}
              {many && <button class="btn outline sm" onClick={removePage}><Icon name="trash" size={18} />Remove page {page + 1}</button>}
            </div>
            <div class="footer-bar" style="display:flex;gap:8px">
              {step > 0 && <button class="btn outline" onClick={() => { setStep(step - 1); setActive(0); }}>Back</button>}
              {cur.optional && <button class="btn outline" onClick={() => next(true)}>Skip</button>}
              <button class="btn" style="flex:1" disabled={!photo || !list.length} onClick={() => next(false)}>
                {step === steps.length - 1 ? (only ? 'Read again' : 'Read the recipe') : 'Next'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
