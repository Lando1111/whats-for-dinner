// Read a recipe from a photo: drag four corners around each part of the page, then the phone
// reads the text itself (Tesseract.js). Nothing is uploaded until the recipe is saved.
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadPhoto, rotateQuarter, straighten, readBoxes, stopReading } from '../lib/ocr.js';
import { joinIngredientLines, joinMethodLines, findServings, tidyTitle, guessSystem } from '../lib/ocrtext.js';
import { Icon } from '../icons.jsx';

const STEPS = [
  { key: 'ingredients', title: 'Ingredients', prompt: 'Drag the corners to fit around the ingredients. If they run into a second column, add another box.', many: true },
  { key: 'method', title: 'Method', prompt: 'Now the method. Add a box for each column or panel, in reading order.', many: true, optional: true },
  { key: 'title', title: 'Name', prompt: "Box the recipe's name, or skip and type it in.", optional: true },
  { key: 'photo', title: 'Dish photo', prompt: 'Box the picture of the dish to use as the recipe photo.', optional: true }
];

function defaultQuad(w, h, existing) {
  // Side by side when there's already a box: left half, then right half.
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

// only: read just one section again ('ingredients' or 'method'). start: { rotations, boxes } from the
// last read of the same photo, so the boxes can be adjusted rather than drawn again.
export function PhotoImport({ file, onDone, onCancel, only = null, start = null }) {
  const steps = only ? STEPS.filter((s) => s.key === only).map((s) => ({ ...s, optional: false })) : STEPS;
  const [rotations, setRotations] = useState(start?.rotations || 0);
  const [photo, setPhoto] = useState(null);
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(null);
  const [step, setStep] = useState(0);
  const [boxes, setBoxes] = useState(() => ({ ingredients: [], method: [], title: [], photo: [], ...(start?.boxes || {}) }));
  const [active, setActive] = useState(0);
  const [reading, setReading] = useState(null);
  const [scale, setScale] = useState(1);
  const svgRef = useRef();
  const drag = useRef(null);

  // Load the photo (right way up), then show it.
  useEffect(() => {
    let gone = false;
    loadPhoto(file).then((c) => { for (let i = 0; i < (start?.rotations || 0); i++) c = rotateQuarter(c); if (!gone) setPhoto(c); }).catch(() => setErr("Couldn't open that photo. Try another one."));
    return () => { gone = true; };
  }, [file]);

  useEffect(() => {
    if (!photo) return undefined;
    let url = null;
    photo.toBlob((b) => { url = URL.createObjectURL(b); setSrc(url); }, 'image/jpeg', 0.85);
    return () => url && URL.revokeObjectURL(url);
  }, [photo]);

  const cur = steps[step];
  const list = boxes[cur.key];

  // Every step starts with one box.
  useEffect(() => {
    if (photo && !boxes[cur.key].length) {
      setBoxes((b) => ({ ...b, [cur.key]: [defaultQuad(photo.width, photo.height, [])] }));
      setActive(0);
    }
  }, [photo, step]);

  // Handles stay the same size on screen whatever the photo's size.
  function measure() {
    const el = svgRef.current;
    const w = el && el.getBoundingClientRect().width;
    if (photo && w > 0) setScale(photo.width / w);
  }
  useEffect(() => { measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, [photo, src]);

  useEffect(() => () => { stopReading(); }, []);

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
    drag.current = { boxIndex, corner, start: toImage(e), quad: list[boxIndex].map((p) => [...p]) };
  }
  function downOnPhoto(e) {
    const pt = toImage(e);
    for (let i = list.length - 1; i >= 0; i--) if (inside(pt, list[i])) return down(e, i, null);
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
    setBoxes((b) => ({ ...b, [cur.key]: b[cur.key].map((x, i) => (i === d.boxIndex ? q : x)) }));
  }
  function up() { drag.current = null; }

  function addBox() {
    setBoxes((b) => ({ ...b, [cur.key]: [...b[cur.key], defaultQuad(photo.width, photo.height, b[cur.key])] }));
    setActive(list.length);
  }
  function removeBox() {
    setBoxes((b) => ({ ...b, [cur.key]: b[cur.key].filter((_, i) => i !== active) }));
    setActive(0);
  }
  function rotate() {
    const r = rotateQuarter(photo);
    setPhoto(r);
    setRotations((n) => (n + 1) % 4);
    setBoxes({ ingredients: [], method: [], title: [], photo: [] });
    setStep(0);
  }

  function next(skip) {
    if (skip) setBoxes((b) => ({ ...b, [cur.key]: [] }));
    if (step < steps.length - 1) { setStep(step + 1); setActive(0); return; }
    const all = skip ? { ...boxes, [cur.key]: [] } : boxes;
    read(only ? { ingredients: [], method: [], title: [], photo: [], [only]: all[only] } : all);
  }

  async function read(all) {
    const jobs = [
      ...all.ingredients.map((quad) => ({ kind: 'ingredients', quad })),
      ...all.method.map((quad) => ({ kind: 'method', quad })),
      ...all.title.map((quad) => ({ kind: 'title', quad }))
    ];
    if (!jobs.length) { setErr('Box at least the ingredients so there is something to read.'); return; }
    setReading({ stage: 'setup', index: 0, total: jobs.length, progress: 0 });
    try {
      const results = await readBoxes(photo, jobs, setReading);
      const of = (kind) => results.filter((r) => r.kind === kind).map((r) => r.lines);
      const allText = results.flatMap((r) => r.lines.map((l) => l.text)).join('\n');
      const preview = (kind) => all[kind].map((q) => straighten(photo, q, { width: 900 }).toDataURL('image/jpeg', 0.8));
      let dish = null;
      if (all.photo.length) dish = await new Promise((res) => straighten(photo, all.photo[0], { width: 1600 }).toBlob(res, 'image/jpeg', 0.9));
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
        again: { file, rotations, boxes: only ? { [only]: all[only] } : all }
      });
    } catch (e) {
      console.error(e);
      setReading(null);
      setErr(navigator.onLine ? "Couldn't read the photo. Try again, or use Paste a list." : 'Reading photos needs a one-off download first. Connect to the internet and try again.');
    }
  }

  const pct = reading ? Math.round((reading.progress || 0) * 100) : 0;
  const r = 22 * scale;

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
            <p class="cap" style="margin:0 16px">{cur.prompt}{step === 0 && ' Tip: press the page flat and take the photo from straight above.'}</p>
            <div class="photo-stage">
              {!src ? <p class="cap">Opening the photo…</p> : (
                <div class="photo-wrap">
                  <img src={src} alt="Your recipe photo" onLoad={measure} />
                  <svg ref={svgRef} viewBox={`0 0 ${photo.width} ${photo.height}`} preserveAspectRatio="none"
                    onPointerDown={downOnPhoto} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                    {steps.filter((s) => s.key !== cur.key).flatMap((s) => boxes[s.key].map((q) => (
                      <polygon points={q.map((p) => p.join(',')).join(' ')} class="quad other" style={`stroke-width:${2 * scale}`} />
                    )))}
                    {/* The box being edited is drawn last so its corners sit on top. */}
                    {list.map((q, i) => [q, i]).sort((a, b) => (a[1] === active) - (b[1] === active)).map(([q, i]) => (
                      <g key={i} class={i === active ? 'quad-g on' : 'quad-g'}>
                        <polygon points={q.map((p) => p.join(',')).join(' ')} class="quad" style={`stroke-width:${3 * scale}`} />
                        {list.length > 1 && <text x={(q[0][0] + q[2][0]) / 2} y={(q[0][1] + q[2][1]) / 2} font-size={28 * scale} class="quad-num">{i + 1}</text>}
                        {i === active && q.map((p, c) => (
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
              {cur.many && <button class="btn outline sm" onClick={addBox} disabled={!photo}><Icon name="plus" size={18} />Add another box</button>}
              {list.length > 1 && <button class="btn outline sm" onClick={removeBox}><Icon name="trash" size={18} />Remove box {active + 1}</button>}
              {step === 0 && !only && <button class="btn outline sm" onClick={rotate} disabled={!photo}><Icon name="rotate" size={18} />Turn photo</button>}
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
