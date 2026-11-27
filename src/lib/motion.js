// Animations: on unless this person turns them off in Settings, or their phone asks for less motion.
import { isHeadChef } from './eggs.js';

const KEY = 'wfd-motion';

export function getMotion() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}

export function applyMotion(on = getMotion()) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.motion = on ? 'on' : 'off';
}

export function setMotion(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  applyMotion(on);
}

export function motionOn() {
  if (typeof window === 'undefined') return false;
  if (!getMotion()) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// A short buzz on Android. Ignored where the phone doesn't support it.
export function buzz(pattern) {
  if (!motionOn()) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

const COLOURS = ['--apricot', '--beet', '--sage', '--butter', '--duck'];

// Confetti from the bottom-centre of the screen (or from a point), drawn on a throwaway canvas.
// Pieces are paper strips and dots in the Hearth colours (or pizza slices / eggs); it cleans up after itself.
export function confetti({ x, y, count = 140, spread = 70, duration = 2600, shape } = {}) {
  if (!motionOn() || typeof document === 'undefined') return;
  shape = shape || (isHeadChef() ? 'pizza' : 'paper');
  if (shape !== 'paper') count = Math.round(count * 0.5);
  const css = getComputedStyle(document.documentElement);
  const colours = COLOURS.map((c) => css.getPropertyValue(c).trim()).filter(Boolean);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = innerWidth, h = innerHeight;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
  canvas.width = w * dpr; canvas.height = h * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const ox = x ?? w / 2, oy = y ?? h * 0.85;
  const rad = (d) => (d * Math.PI) / 180;
  const pieces = Array.from({ length: count }, () => {
    const angle = rad(-90 + (Math.random() - 0.5) * spread);
    const speed = (0.55 + Math.random() * 0.6) * Math.min(h, 900) * 0.0016;
    return {
      x: ox + (Math.random() - 0.5) * 40, y: oy,
      vx: Math.cos(angle) * speed * 9, vy: Math.sin(angle) * speed * 14,
      size: (shape === 'paper' ? 6 : 14) + Math.random() * 6, dot: Math.random() < 0.3,
      spin: Math.random() * Math.PI, vspin: (Math.random() - 0.5) * 0.35,
      tilt: Math.random() * Math.PI, vtilt: 0.05 + Math.random() * 0.1,
      colour: colours[Math.floor(Math.random() * colours.length)] || '#f2b08a'
    };
  });

  const start = performance.now();
  let last = start;
  function frame(now) {
    const t = now - start;
    const dt = Math.min(2, (now - last) / 16.7); last = now;
    ctx.clearRect(0, 0, w, h);
    const fade = t > duration - 600 ? Math.max(0, (duration - t) / 600) : 1;
    for (const p of pieces) {
      p.vy += 0.32 * dt; // gravity
      p.vx *= 0.985 ** dt; p.vy *= 0.985 ** dt; // air
      p.x += p.vx * dt + Math.sin(p.tilt) * 0.6; p.y += p.vy * dt;
      p.spin += p.vspin * dt; p.tilt += p.vtilt * dt;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.colour;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      if (shape === 'pizza') slice(ctx, p.size, css);
      else if (shape === 'egg') { ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.36, p.size * 0.48, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-p.size * 0.36, -p.size * 0.05, p.size * 0.72, p.size * 0.12); }
      else if (p.dot) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 4 * Math.abs(Math.cos(p.tilt)), p.size, (p.size / 2) * Math.abs(Math.cos(p.tilt)) + 1);
      ctx.restore();
    }
    if (t < duration) requestAnimationFrame(frame); else canvas.remove();
  }
  requestAnimationFrame(frame);
}

// A little pizza slice: crust, cheese, two pepperoni.
function slice(ctx, s, css) {
  const v = (n, f) => css.getPropertyValue(n).trim() || f;
  ctx.beginPath(); ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, -s / 2); ctx.lineTo(0, s / 2); ctx.closePath();
  ctx.fillStyle = v('--butter', '#f4d77f'); ctx.fill();
  ctx.fillStyle = v('--apricot', '#f2b08a'); ctx.fillRect(-s / 2, -s / 2 - s * 0.12, s, s * 0.16);
  ctx.fillStyle = v('--beet', '#8a2f52');
  ctx.beginPath(); ctx.arc(-s * 0.12, -s * 0.12, s * 0.09, 0, Math.PI * 2); ctx.arc(s * 0.1, s * 0.05, s * 0.08, 0, Math.PI * 2); ctx.fill();
}
