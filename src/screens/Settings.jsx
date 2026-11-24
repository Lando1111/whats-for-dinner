import { useState } from 'preact/hooks';
import { supabase, friendly } from '../lib/supabase.js';
import { getTheme, setTheme } from '../lib/theme.js';
import { Icon } from '../icons.jsx';

const WEEKDAYS = [['M', 'Monday', 1], ['T', 'Tuesday', 2], ['W', 'Wednesday', 3], ['T', 'Thursday', 4], ['F', 'Friday', 5], ['S', 'Saturday', 6], ['S', 'Sunday', 0]];

function Seg({ label, options, value, onChange, disabled }) {
  return (
    <div class="seg" role="group" aria-label={label} style="margin-left:auto;flex:none">
      {options.map(([v, text]) => (
        <button type="button" aria-pressed={value === v ? 'true' : 'false'} disabled={disabled} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min, max, unit, onChange, disabled }) {
  return (
    <span style="margin-left:auto;display:flex;align-items:center;gap:8px">
      <button type="button" class="icon-btn" style="border:2px solid var(--ls)" aria-label={`Less ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span style="min-width:64px;text-align:center;font-weight:700">{value}{unit}</span>
      <button type="button" class="icon-btn" style="border:2px solid var(--ls)" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  );
}

export function Settings({ member, household, reload, say }) {
  const [theme, setThemeState] = useState(getTheme());
  const isOwner = member.role === 'owner';
  const s = household.settings || {};
  const units = s.unit_prefs || { dry: 'g', liquid: 'ml', butter: 'g' };
  const leftovers = s.leftover_weekdays || [];

  async function save(patch) {
    const settings = { ...s, ...patch };
    const { error } = await supabase.from('households').update({ settings }).eq('id', household.id);
    if (error) return say(friendly(error), true);
    reload();
  }

  return (
    <main class="main">
      <div class="row-head"><h1 class="title">Settings</h1></div>

      <section>
        <h2 class="lbl">Household</h2>
        <div class="card">
          <a href="#/household" class="row" style="text-decoration:none;color:var(--ink)">
            <span style="display:flex;flex-direction:column"><span>{household.name}</span><span class="cap">People, invites and access</span></span>
            <span style="margin-left:auto;display:flex;align-items:center;gap:4px;color:var(--beet);font-weight:700;font-size:15px">Manage<Icon name="next" size={18} stroke={2.4} /></span>
          </a>
        </div>
      </section>

      <section>
        <h2 class="lbl">Units I use</h2>
        <div class="card">
          <div class="row"><span>Dry ingredients</span><Seg label="Dry ingredients" options={[['g', 'Grams'], ['cup', 'Cups']]} value={units.dry} disabled={!isOwner} onChange={(v) => save({ unit_prefs: { ...units, dry: v } })} /></div>
          <div class="row"><span>Liquids</span><Seg label="Liquids" options={[['ml', 'ml'], ['cup', 'Cups']]} value={units.liquid} disabled={!isOwner} onChange={(v) => save({ unit_prefs: { ...units, liquid: v } })} /></div>
          <div class="row"><span>Butter</span><Seg label="Butter" options={[['g', 'Grams'], ['tbsp', 'Tbsp']]} value={units.butter} disabled={!isOwner} onChange={(v) => save({ unit_prefs: { ...units, butter: v } })} /></div>
        </div>
      </section>

      <section>
        <h2 class="lbl">Planning</h2>
        <div class="card">
          <div style="padding:10px 0;border-bottom:1px solid var(--line)">
            <span>Leftover nights</span>
            <div role="group" aria-label="Leftover nights" style="display:flex;gap:4px;margin-top:8px">
              {WEEKDAYS.map(([short, long, n]) => {
                const on = leftovers.includes(n);
                return (
                  <button type="button" aria-label={long} aria-pressed={on ? 'true' : 'false'} disabled={!isOwner}
                    style={`flex:1;height:44px;border-radius:999px;border:2px solid ${on ? 'var(--butter)' : 'var(--ls)'};background:${on ? 'var(--butter)' : 'var(--raised)'};font-weight:700;font-size:14px;padding:0`}
                    onClick={() => save({ leftover_weekdays: on ? leftovers.filter((x) => x !== n) : [...leftovers, n] })}>{short}</button>
                );
              })}
            </div>
          </div>
          <div class="row"><span style="display:flex;flex-direction:column"><span>Don't repeat within</span><span class="cap">for Fill the week</span></span>
            <Stepper label="weeks" value={s.no_repeat_weeks ?? 2} min={0} max={8} unit={(s.no_repeat_weeks ?? 2) === 1 ? ' week' : ' weeks'} disabled={!isOwner} onChange={(v) => save({ no_repeat_weeks: v })} /></div>
          <div class="row"><span>Vegetarian nights</span>
            <Stepper label="vegetarian nights" value={s.min_veg_nights ?? 0} min={0} max={7} unit="+" disabled={!isOwner} onChange={(v) => save({ min_veg_nights: v })} /></div>
        </div>
        {!isOwner && <p class="cap" style="margin:8px 0 0">Only the household owner can change units and planning.</p>}
      </section>

      <section>
        <h2 class="lbl">Appearance</h2>
        <div class="card">
          <div class="row"><span>Theme</span><Seg label="Theme" options={[['light', 'Light'], ['dark', 'Dark'], ['phone', 'Phone']]} value={theme} onChange={(v) => { setTheme(v); setThemeState(v); }} /></div>
        </div>
      </section>

      <button class="link" style="align-self:center" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </main>
  );
}
