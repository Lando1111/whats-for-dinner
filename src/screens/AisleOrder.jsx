// Put the shopping list's sections in the order you walk your shop. Drag the handle, or use the arrows.
// Saved to your account, so it's the same on all your devices (and separate from other people's).
import { useRef, useState } from 'preact/hooks';
import { SECTIONS } from '../lib/sections.js';
import { useSectionOrder, orderedSections, saveSectionOrder } from '../lib/prefs.js';
import { friendly } from '../lib/supabase.js';
import { Icon } from '../icons.jsx';

const LABEL = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label]));

export function AisleOrder({ onClose, say }) {
  const saved = useSectionOrder();
  const [list, setList] = useState(() => orderedSections(saved).map((s) => s.id));
  const [dragging, setDragging] = useState(null);
  const [saving, setSaving] = useState(false);
  const listRef = useRef();
  const drag = useRef(null);

  function start(e, id) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id };
    setDragging(id);
  }
  function move(e) {
    if (!drag.current) return;
    const rows = [...listRef.current.children];
    // Scroll the sheet when dragging near its top or bottom edge.
    const sheet = listRef.current.closest('.sheet');
    const box = sheet.getBoundingClientRect();
    if (e.clientY > box.bottom - 72) sheet.scrollTop += 14;
    else if (e.clientY < box.top + 72) sheet.scrollTop -= 14;
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    setList((cur) => {
      const from = cur.indexOf(drag.current.id);
      if (from === to) return cur;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, drag.current.id);
      return next;
    });
  }
  function end() { drag.current = null; setDragging(null); }

  const shift = (i, by) => setList((cur) => {
    const j = i + by;
    if (j < 0 || j >= cur.length) return cur;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  async function done() {
    setSaving(true);
    try {
      await saveSectionOrder(list);
      say('Aisle order saved.');
      onClose();
    } catch (err) {
      say(friendly(err), true);
      setSaving(false);
    }
  }

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="sheet aisle-sheet" role="dialog" aria-label="Aisle order">
        <div class="handle" />
        <h2 style="margin:0;font:600 22px/28px var(--display)">Aisle order</h2>
        <p class="cap" style="margin:0">Drag the sections into the order you walk your shop. Saved for you on all your devices.</p>
        <ol class="aisles" ref={listRef} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          {list.map((id, i) => (
            <li key={id} class={dragging === id ? 'aisle dragging' : 'aisle'}>
              <span class="grip" onPointerDown={(e) => start(e, id)} aria-hidden="true"><Icon name="grip" size={22} /></span>
              <span class="aisle-name">{LABEL[id]}</span>
              <button class="icon-btn" aria-label={`Move ${LABEL[id]} up`} disabled={i === 0} onClick={() => shift(i, -1)}><Icon name="up" size={20} /></button>
              <button class="icon-btn" aria-label={`Move ${LABEL[id]} down`} disabled={i === list.length - 1} onClick={() => shift(i, 1)}><Icon name="down" size={20} /></button>
            </li>
          ))}
        </ol>
        <button class="link" style="align-self:flex-start;min-height:44px" onClick={() => setList(SECTIONS.map((s) => s.id))}>Reset to Coles' order</button>
        <div class="footer-bar" style="display:flex;gap:8px">
          <button class="btn outline" onClick={onClose}>Cancel</button>
          <button class="btn" style="flex:1" disabled={saving} onClick={done}>{saving ? 'Saving…' : 'Done'}</button>
        </div>
      </section>
    </div>
  );
}
