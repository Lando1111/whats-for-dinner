import { useState } from 'preact/hooks';
import { supabase, friendly, APP_URL } from '../lib/supabase.js';

export function SignIn({ say, invited }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('wfd-email') || ''; } catch { return ''; } });
  const [step, setStep] = useState('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: APP_URL, shouldCreateUser: true } });
    setBusy(false);
    if (error) return say(friendly(error), true);
    try { localStorage.setItem('wfd-email', email.trim()); } catch { /* ignore */ }
    setStep('code');
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) say(friendly(error), true);
  }

  return (
    <main class="main no-tabs" style="justify-content:center;gap:24px">
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
        <img src={`${import.meta.env.BASE_URL}icons/pizza-mark.svg`} alt="" width="96" height="96" />
        <h1 class="display">What's for dinner?</h1>
        <p class="cap" style="font-size:15px;line-height:22px;margin:0">
          {invited ? "You've been invited to join a household. Sign in to accept." : 'Plan the week, keep your recipes and share the shopping list.'}
        </p>
      </div>

      {step === 'email' ? (
        <form onSubmit={send} style="display:flex;flex-direction:column;gap:12px">
          <label class="lbl" for="email" style="margin:0">Your email</label>
          <input id="email" class="field" type="email" autocomplete="email" inputmode="email" required value={email} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="you@example.com" />
          <button class="btn block" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
          <p class="cap" style="margin:0;text-align:center">No password needed. New here? This creates your account.</p>
        </form>
      ) : (
        <form onSubmit={verify} style="display:flex;flex-direction:column;gap:12px">
          <label class="lbl" for="code" style="margin:0">Code sent to {email}</label>
          <input id="code" class="field code" inputmode="numeric" autocomplete="one-time-code" maxLength={8} required value={code} onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))} placeholder="••••••" />
          <button class="btn block" disabled={busy || code.length < 6}>{busy ? 'Checking…' : 'Sign in'}</button>
          <p class="cap" style="margin:0;text-align:center">Or tap the link in the email on this phone.</p>
          <button type="button" class="link" onClick={() => { setStep('email'); setCode(''); }}>Use a different email</button>
        </form>
      )}
    </main>
  );
}
