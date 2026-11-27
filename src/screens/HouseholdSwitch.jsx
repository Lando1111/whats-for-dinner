// "Your households": switch between households you belong to, or start your own.
import { useState } from 'preact/hooks';
import { switchHousehold, startHousehold, ROLE_LABEL } from '../lib/households.js';
import { friendly } from '../lib/supabase.js';
import { Icon } from '../icons.jsx';

export function HouseholdSwitch({ memberships, current, userId, onClose, say }) {
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [name, setName] = useState('');
  const me = memberships.find((m) => m.household_id === current) || memberships[0];

  async function open(id) {
    if (id === current) return onClose();
    setBusy(true);
    try { await switchHousehold(userId, id); } catch (err) { say(err.message?.includes('waiting to sync') ? err.message : friendly(err), true); setBusy(false); }
  }
  async function start(e) {
    e.preventDefault();
    setBusy(true);
    try { await startHousehold(name || 'Our kitchen', me?.display_name); } catch (err) { say(friendly(err), true); setBusy(false); }
  }

  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="sheet" role="dialog" aria-label="Your households">
        <div class="handle" />
        <h2 style="margin:0;font:600 22px/28px var(--display)">Your households</h2>
        <p class="cap" style="margin:0">Each household has its own recipes, week and shopping list. Switching changes what this phone shows.</p>
        <ul class="card" style="list-style:none;margin:0;padding:0">
          {memberships.map((m) => {
            const on = m.household_id === current;
            return (
              <li style="border-bottom:1px solid var(--line)">
                <button class="row" style="width:100%;background:none;border:0;text-align:left;min-height:56px;color:var(--ink)" disabled={busy} aria-current={on ? 'true' : undefined} onClick={() => open(m.household_id)}>
                  <span style="display:flex;flex-direction:column;flex:1">
                    <span style="font-weight:700">{m.households.name}</span>
                    <span class="cap">{ROLE_LABEL[m.role] || m.role}</span>
                  </span>
                  {on ? <span class="cap" style="display:flex;align-items:center;gap:4px;font-weight:700"><Icon name="check" size={16} stroke={2.6} />Open</span> : <Icon name="next" size={20} />}
                </button>
              </li>
            );
          })}
        </ul>
        {starting ? (
          <form onSubmit={start} style="display:flex;flex-direction:column;gap:8px">
            <label class="lbl" for="hh" style="margin:0">Name of your household</label>
            <input id="hh" class="field" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. The Smith kitchen" maxLength={60} />
            <span class="cap">You'll be its owner. Your other households stay as they are.</span>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn outline" onClick={() => setStarting(false)}>Cancel</button>
              <button class="btn" style="flex:1" disabled={busy}>{busy ? 'Setting up…' : 'Start household'}</button>
            </div>
          </form>
        ) : (
          <button class="btn outline" onClick={() => setStarting(true)}><Icon name="plus" size={20} />Start your own household</button>
        )}
      </section>
    </div>
  );
}

// Small button showing the open household's name, for anyone in more than one.
export function HouseholdChip({ memberships, household, onOpen }) {
  if (!memberships || memberships.length < 2) return null;
  return (
    <button class="house-chip" onClick={onOpen} aria-label={`${household.name}. Switch household`}>
      <span>{household.name}</span><Icon name="down" size={16} />
    </button>
  );
}
