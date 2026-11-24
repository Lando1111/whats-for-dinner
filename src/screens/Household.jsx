import { useCallback, useEffect, useState } from 'preact/hooks';
import { supabase, friendly, APP_URL } from '../lib/supabase.js';
import { Icon } from '../icons.jsx';

const ROLE_TEXT = { owner: 'Owner · can manage people', full: 'Full access', shopping: 'Shopping only' };
const AV_BG = ['var(--apricot)', 'var(--sage)', 'var(--duck)', 'var(--butter)'];

function daysLeft(iso) {
  const d = Math.ceil((new Date(iso) - Date.now()) / 86400000);
  return d <= 1 ? 'expires within a day' : `expires in ${d} days`;
}

export function Household({ member, household, reload, say, userId }) {
  const isOwner = member.role === 'owner';
  const [people, setPeople] = useState([]);
  const [invites, setInvites] = useState([]);
  const [open, setOpen] = useState(null);
  const [inviteRole, setInviteRole] = useState('full');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(household.name);
  const [shareLink, setShareLink] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('household_members').select('user_id, display_name, role, joined_at').order('joined_at');
    if (error) return say(friendly(error), true);
    setPeople(data);
    if (isOwner) {
      const inv = await supabase.from('household_invites').select('id, role, expires_at').is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at');
      if (!inv.error) setInvites(inv.data);
    }
  }, [isOwner, say]);
  useEffect(() => { load(); }, [load]);

  async function act(promise, done) {
    const { error } = await promise;
    if (error) return say(friendly(error), true);
    if (done) say(done);
    load();
  }

  async function rename(e) {
    e.preventDefault();
    const { error } = await supabase.from('households').update({ name: name.trim() }).eq('id', household.id);
    if (error) return say(friendly(error), true);
    setRenaming(false);
    reload();
  }

  async function invite() {
    const { data: token, error } = await supabase.rpc('create_invite', { p_role: inviteRole });
    if (error) return say(friendly(error), true);
    const url = `${APP_URL}#/join/${token}`;
    const text = `Join ${household.name} on What's for Dinner?`;
    load();
    try {
      if (navigator.share) { await navigator.share({ title: "What's for Dinner?", text, url }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); say('Invite link copied. Paste it into a message.'); } catch { setShareLink(url); }
  }

  async function leave() {
    const { error } = await supabase.from('household_members').delete().eq('user_id', userId);
    if (error) return say(friendly(error), true);
    location.hash = '#/week';
    reload();
  }

  return (
    <main class="main">
      <header class="row-head" style="gap:4px">
        <a href="#/settings" class="icon-btn" aria-label="Back to settings" style="margin-left:-10px"><Icon name="back" /></a>
        <h1 class="title">Household</h1>
      </header>

      <section>
        <h2 class="lbl">Name</h2>
        <div class="card">
          {renaming ? (
            <form class="row" onSubmit={rename}>
              <label class="sr" for="hname">Household name</label>
              <input id="hname" class="field" style="height:44px" maxLength={60} required value={name} onInput={(e) => setName(e.currentTarget.value)} />
              <button class="link">Save</button>
            </form>
          ) : (
            <div class="row"><span style="font-weight:700">{household.name}</span>{isOwner && <button class="link" style="margin-left:auto" onClick={() => setRenaming(true)}>Rename</button>}</div>
          )}
        </div>
      </section>

      <section>
        <h2 class="lbl">People · {people.length}{invites.length ? `, plus ${invites.length} invited` : ''}</h2>
        <div class="card">
          {people.map((p, i) => {
            const me = p.user_id === userId;
            const canManage = isOwner && !me;
            return (
              <div style="border-bottom:1px solid var(--line);padding-bottom:4px">
                <div class="row" style="border:0;min-height:64px">
                  <span class="av" style={`background:${AV_BG[i % 4]};color:var(--on-ap)`}>{(p.display_name || '?').slice(0, 1).toUpperCase()}</span>
                  <span style="display:flex;flex-direction:column">
                    <span style="font-weight:700">{p.display_name || 'No name'}{me ? ' (you)' : ''}</span>
                    <span class="cap">{ROLE_TEXT[p.role]}</span>
                  </span>
                  {canManage && <button class="link" style="margin-left:auto" aria-expanded={open === p.user_id ? 'true' : 'false'} onClick={() => setOpen(open === p.user_id ? null : p.user_id)}>{open === p.user_id ? 'Done' : 'Change'}</button>}
                </div>
                {canManage && open === p.user_id && (
                  <div style="margin:0 0 8px 52px;display:flex;flex-direction:column;align-items:flex-start;gap:4px">
                    <div class="seg" role="group" aria-label={`${p.display_name}'s access`} style="width:100%">
                      <button aria-pressed={p.role === 'full' ? 'true' : 'false'} onClick={() => act(supabase.from('household_members').update({ role: 'full' }).eq('user_id', p.user_id))}>Full access</button>
                      <button aria-pressed={p.role === 'shopping' ? 'true' : 'false'} onClick={() => act(supabase.from('household_members').update({ role: 'shopping' }).eq('user_id', p.user_id))}>Shopping only</button>
                    </div>
                    <button class="link" style="padding:0" onClick={() => { if (window.confirm(`Remove ${p.display_name || 'this person'} from ${household.name}?`)) act(supabase.from('household_members').delete().eq('user_id', p.user_id), 'Removed from the household'); }}>Remove from household</button>
                  </div>
                )}
              </div>
            );
          })}
          {invites.map((inv) => (
            <div class="row" style="min-height:64px">
              <span class="av" style="border:2px dashed var(--ls);color:var(--muted)">?</span>
              <span style="display:flex;flex-direction:column"><span style="font-weight:700">Invite link sent</span><span class="cap">{ROLE_TEXT[inv.role]} · {daysLeft(inv.expires_at)}</span></span>
              <button class="link" style="margin-left:auto" onClick={() => act(supabase.from('household_invites').delete().eq('id', inv.id), 'Invite cancelled')}>Cancel</button>
            </div>
          ))}
        </div>
        <p class="cap" style="margin:8px 0 0">Shopping only: can see the week and tick off the list, but can't change meals or recipes.</p>
      </section>

      {isOwner && (
        <section style="display:flex;flex-direction:column;gap:8px">
          <h2 class="lbl" style="margin:0">Invite someone</h2>
          <div class="seg" role="group" aria-label="Access for the new person">
            <button aria-pressed={inviteRole === 'full' ? 'true' : 'false'} onClick={() => setInviteRole('full')}>Full access</button>
            <button aria-pressed={inviteRole === 'shopping' ? 'true' : 'false'} onClick={() => setInviteRole('shopping')}>Shopping only</button>
          </div>
          <button class="btn block" onClick={invite}><Icon name="invite" />Share an invite link</button>
          <p class="cap" style="margin:0;text-align:center">Send it by Messages, WhatsApp or email. It works once and expires after 7 days.</p>
          {shareLink && <input class="field" readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link to copy" />}
        </section>
      )}

      {!isOwner && <button class="link" style="align-self:center" onClick={() => { if (window.confirm(`Leave ${household.name}? You'll lose access to its plan, recipes and list.`)) leave(); }}>Leave household</button>}
    </main>
  );
}
