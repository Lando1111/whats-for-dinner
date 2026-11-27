import { useCallback, useEffect, useState } from 'preact/hooks';
import { supabase, friendly } from './lib/supabase.js';
import { useRoute, go } from './lib/router.js';
import { Icon } from './icons.jsx';
import { SignIn } from './screens/SignIn.jsx';
import { Onboarding } from './screens/Onboarding.jsx';
import { Week } from './screens/Week.jsx';
import { Recipes } from './screens/Recipes.jsx';
import { Recipe } from './screens/Recipe.jsx';
import { RecipeEdit } from './screens/RecipeEdit.jsx';
import { Shopping } from './screens/Shopping.jsx';
import { Build } from './screens/Build.jsx';
import { clearRecipeCache } from './lib/data.js';
import { Settings } from './screens/Settings.jsx';
import { Household } from './screens/Household.jsx';
import { loadMemberships, joinHousehold } from './lib/households.js';

const INVITE_KEY = 'wfd-invite';
const readInvite = () => { try { return localStorage.getItem(INVITE_KEY); } catch { return null; } };
const clearInvite = () => { try { localStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } };

const TABS = [
  { name: 'week', label: 'Week', icon: 'week' },
  { name: 'shopping', label: 'Shopping', icon: 'cart' },
  { name: 'recipes', label: 'Recipes', icon: 'book' },
  { name: 'settings', label: 'Settings', icon: 'gear' }
];

export function App() {
  const route = useRoute();
  const [session, setSession] = useState(undefined);
  const [member, setMember] = useState(undefined); // undefined = loading, null = not in a household
  const [memberships, setMemberships] = useState([]);
  const [toast, setToast] = useState(null);

  const say = useCallback((text, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast((t) => (t && t.text === text ? null : t)), 4500);
  }, []);

  // Remember an invite link so it survives signing in.
  useEffect(() => {
    if (route.name === 'join' && route.param) {
      try { localStorage.setItem(INVITE_KEY, route.param); } catch { /* ignore */ }
    }
  }, [route.name, route.param]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const loadMember = useCallback(async () => {
    if (!userId) { setMember(undefined); return; }
    try {
      const { list, open } = await loadMemberships(userId);
      setMemberships(list);
      setMember(open);
    } catch (error) { say(friendly(error), true); }
  }, [userId, say]);

  useEffect(() => { loadMember(); }, [loadMember]);

  let screen;
  if (session === undefined || (session && member === undefined)) {
    screen = <div class="main no-tabs"><p class="cap" style="margin:auto">Loading…</p></div>;
  } else if (!session) {
    screen = <SignIn say={say} invited={!!readInvite()} />;
  } else if (member === null) {
    screen = <Onboarding say={say} invite={readInvite()} onDone={() => { clearInvite(); loadMember(); go('week'); }} onDropInvite={() => { clearInvite(); loadMember(); }} />;
  } else {
    const props = { member, household: member.households, reload: loadMember, say, userId, memberships };
    const canEdit = member.role !== 'shopping';
    const name = route.name === 'join' ? 'week' : route.name;
    if (route.name === 'join') { clearInvite(); }
    if (route.name === 'join' && route.param) screen = <JoinAnother token={route.param} member={member} say={say} />;
    else if (name === 'settings') screen = <Settings {...props} />;
    else if (name === 'household') screen = <Household {...props} />;
    else if (name === 'shopping') screen = <Shopping {...props} />;
    else if (name === 'build' && canEdit) screen = <Build {...props} start={route.param} />;
    else if (name === 'recipes') screen = <Recipes canEdit={canEdit} />;
    else if (name === 'recipe' && (route.param === 'new' || route.sub === 'edit') && canEdit) screen = <RecipeEdit {...props} id={route.param} />;
    else if (name === 'recipe' && route.param) screen = <Recipe {...props} id={route.param} canEdit={canEdit} />;
    else screen = <Week {...props} />;
  }

  const showTabs = session && member && !['recipe', 'build'].includes(route.name);
  const current = route.name === 'household' ? 'settings' : route.name;
  useEffect(() => { if (!session) clearRecipeCache(); }, [session]);
  return (
    <div class="app">
      {screen}
      {showTabs && (
        <div class="tabs">
          <nav aria-label="Main">
            {TABS.map((t) => (
              <a href={`#/${t.name}`} aria-current={current === t.name || (t.name === 'week' && !TABS.some((x) => x.name === current)) ? 'page' : undefined}>
                <span><Icon name={t.icon} /></span>{t.label}
              </a>
            ))}
          </nav>
        </div>
      )}
      {toast && <div class={`toast${toast.err ? ' err' : ''}`} role="status">{toast.text}</div>}
    </div>
  );
}

// Someone already in a household opened an invite link: join that one too (their own stays).
function JoinAnother({ token, member, say }) {
  const [busy, setBusy] = useState(false);
  async function join() {
    setBusy(true);
    try { await joinHousehold(token, member.display_name); } catch (err) { say(friendly(err), true); setBusy(false); }
  }
  return (
    <main class="main">
      <div style="text-align:center;display:flex;flex-direction:column;gap:8px;margin-top:24px">
        <h1 class="display">Join another household?</h1>
        <p class="cap" style="margin:0">You've been invited to another household. You'll keep {member.households.name} and can switch between them in Settings.</p>
      </div>
      <button class="btn" disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join household'}</button>
      <button class="btn outline" onClick={() => go('week')}>Not now</button>
    </main>
  );
}
