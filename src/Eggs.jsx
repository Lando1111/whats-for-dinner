// Easter egg pieces. All decorative: hidden from screen readers, and skipped when animations are off.
import { useEffect, useState } from 'preact/hooks';
import { TROPHIES, foundSecrets, seenTrophies } from './lib/eggs.js';
import { motionOn } from './lib/motion.js';
import { Icon } from './icons.jsx';

const BASE = import.meta.env.BASE_URL;

// Re-render each minute so time-based touches (late-night title, UFO) come and go on their own.
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  return now;
}

// The pizza logo, sometimes wearing a hat.
export function PizzaMark({ hat, size = 36 }) {
  return (
    <span class="pizza-mark" style={`width:${size}px;height:${size}px`}>
      <img src={`${BASE}icons/pizza-mark.svg`} alt="" width={size} height={size} />
      {hat && (
        <svg class="hat" viewBox="0 0 40 24" aria-hidden="true">
          {hat === 'pumpkin' && <><ellipse cx="20" cy="15" rx="11" ry="8" fill="#e8892b" stroke="#3a2e26" stroke-width="1.5" /><path d="M15 9c0 6 0 10 0 13M25 9c0 6 0 10 0 13" stroke="#b9641c" stroke-width="1.2" fill="none" /><path d="M20 7c0-3 1-5 3-6" stroke="#5d7a3a" stroke-width="2.5" stroke-linecap="round" fill="none" /></>}
          {hat === 'santa' && <><path d="M8 20 Q18 0 32 6 L30 20z" fill="#c8423a" stroke="#3a2e26" stroke-width="1.2" /><rect x="6" y="18" width="27" height="5" rx="2.5" fill="#fff" stroke="#3a2e26" stroke-width="1" /><circle cx="33" cy="7" r="3.2" fill="#fff" stroke="#3a2e26" stroke-width="1" /></>}
          {hat === 'nightcap' && <><path d="M9 21 Q14 2 31 9 Q24 10 30 21z" fill="#aed0d4" stroke="#3a2e26" stroke-width="1.2" /><circle cx="32" cy="10" r="3" fill="#f4d77f" stroke="#3a2e26" stroke-width="1" /><rect x="7" y="19" width="25" height="4" rx="2" fill="#fffdf9" stroke="#3a2e26" stroke-width="1" /></>}
        </svg>
      )}
    </span>
  );
}

// 2–3 am: a little UFO drifts across and beams up a meatball.
export function Ufo() {
  if (!motionOn()) return null;
  return (
    <div class="ufo-lane" aria-hidden="true">
      <svg class="ufo" viewBox="0 0 60 70" width="60" height="70">
        <path class="beam" d="M22 22 L8 68 L52 68 L38 22z" fill="#f4d77f" opacity="0" />
        <circle class="meatball" cx="30" cy="62" r="5" fill="#8a5a3c" stroke="#3a2e26" stroke-width="1" />
        <ellipse cx="30" cy="10" rx="10" ry="8" fill="#aed0d4" stroke="#3a2e26" stroke-width="1.5" />
        <ellipse cx="30" cy="17" rx="24" ry="7" fill="#b9d3a6" stroke="#3a2e26" stroke-width="1.5" />
        <circle cx="18" cy="17" r="1.8" fill="#f4d77f" /><circle cx="30" cy="19" r="1.8" fill="#f4d77f" /><circle cx="42" cy="17" r="1.8" fill="#f4d77f" />
      </svg>
    </div>
  );
}

// Christmas: gentle snow over the top of the Week screen.
const FLAKES = Array.from({ length: 18 }, (_, i) => ({ left: (i * 53) % 100, delay: (i * 0.7) % 6, dur: 5 + ((i * 37) % 40) / 10, size: 4 + (i % 3) * 2 }));
export function Snow() {
  if (!motionOn()) return null;
  return (
    <div class="snow" aria-hidden="true">
      {FLAKES.map((f) => <span style={`left:${f.left}%;width:${f.size}px;height:${f.size}px;animation-duration:${f.dur}s;animation-delay:${f.delay}s`} />)}
    </div>
  );
}

// Now and then the pizza peeks up from behind the tab bar. Tap it before it hides.
export function Peekaboo({ onCatch }) {
  const [gone, setGone] = useState(false);
  const [left] = useState(() => 15 + Math.random() * 60);
  useEffect(() => { const t = setTimeout(() => setGone(true), 4200); return () => clearTimeout(t); }, []);
  if (gone || !motionOn()) return null;
  return (
    <div class="peek-lane" aria-hidden="true">
      <button class="peek" tabIndex={-1} style={`left:${left}%`} onClick={() => { setGone(true); onCatch(); }}>
        <img src={`${BASE}icons/pizza-mark.svg`} alt="" width="56" height="56" />
      </button>
    </div>
  );
}

// Easter: a chocolate egg hidden on a week tile.
export function EasterEgg({ colour, onFind }) {
  const [taken, setTaken] = useState(false);
  return (
    <button class={`easter-egg${taken ? ' taken' : ''}`} tabIndex={-1} aria-hidden="true"
      onClick={(e) => { e.stopPropagation(); if (taken) return; setTaken(true); setTimeout(onFind, motionOn() ? 350 : 0); }}>
      <svg viewBox="0 0 24 30" width="24" height="30"><ellipse cx="12" cy="16" rx="10" ry="13" fill="#7a4a2e" stroke="#3a2e26" stroke-width="1.2" /><path d="M2.5 15 Q7 11 12 15 T21.5 15" fill="none" stroke={colour} stroke-width="3" /><ellipse cx="8" cy="10" rx="2" ry="3.5" fill="rgba(255,255,255,.35)" /></svg>
    </button>
  );
}

// Settings → Trophy cabinet.
export function TrophyCabinet({ household, onClose }) {
  const earned = seenTrophies(household.id);
  const found = foundSecrets();
  const has = (t) => (t.secret ? found.has(t.id) : earned.has(t.id));
  const count = TROPHIES.filter(has).length;
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="sheet" role="dialog" aria-label="Trophy cabinet">
        <div class="handle" />
        <div class="row-head">
          <div style="display:flex;flex-direction:column"><h2 style="margin:0;font:600 22px/28px var(--display)">Trophy cabinet</h2><span class="cap">{count} of {TROPHIES.length} · secret ones are just for this phone</span></div>
          <button class="icon-btn" style="margin-left:auto" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        <ul class="trophies">
          {TROPHIES.map((t) => {
            const got = has(t);
            const hidden = t.secret && !got;
            return (
              <li class={got ? 'got' : ''}>
                <span class="medal" aria-hidden="true"><Icon name={got ? 'trophy' : hidden ? 'help' : 'lock'} size={20} stroke={2.2} /></span>
                <span style="display:flex;flex-direction:column">
                  <span style="font-weight:700">{hidden ? '???' : t.name}</span>
                  <span class="cap">{hidden ? 'A secret. Keep exploring.' : t.how}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
