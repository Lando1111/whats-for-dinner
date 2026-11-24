import { useState } from 'preact/hooks';
import { supabase, friendly } from '../lib/supabase.js';

export function Onboarding({ say, invite, onDone, onDropInvite }) {
  const [name, setName] = useState('');
  const [house, setHouse] = useState('Our kitchen');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = invite
      ? await supabase.rpc('accept_invite', { p_token: invite, p_display_name: name.trim() })
      : await supabase.rpc('create_household', { p_name: house.trim(), p_display_name: name.trim() });
    setBusy(false);
    if (error) return say(friendly(error), true);
    onDone();
  }

  return (
    <main class="main no-tabs" style="justify-content:center;gap:24px">
      <div style="text-align:center;display:flex;flex-direction:column;gap:8px">
        <h1 class="display">{invite ? 'Join the household' : 'Set up your household'}</h1>
        <p class="cap" style="font-size:15px;line-height:22px;margin:0">
          {invite ? "You'll share the week, recipes and shopping list with them." : 'Everyone you invite shares one week plan, recipe book and shopping list.'}
        </p>
      </div>
      <form onSubmit={submit} style="display:flex;flex-direction:column;gap:12px">
        <label class="lbl" for="name" style="margin:0">Your name</label>
        <input id="name" class="field" autocomplete="given-name" required maxLength={40} value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="What others will see" />
        {!invite && (
          <>
            <label class="lbl" for="house" style="margin:8px 0 0">Household name</label>
            <input id="house" class="field" required maxLength={60} value={house} onInput={(e) => setHouse(e.currentTarget.value)} />
          </>
        )}
        <button class="btn block" style="margin-top:8px" disabled={busy || !name.trim()}>{busy ? 'One moment…' : invite ? 'Join' : 'Create household'}</button>
      </form>
      {invite
        ? <button class="link" onClick={onDropInvite}>Start my own household instead</button>
        : <p class="cap" style="text-align:center;margin:0">Joining someone else's? Open their invite link on this phone.</p>}
    </main>
  );
}
