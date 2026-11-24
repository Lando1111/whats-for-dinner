import { createClient } from '@supabase/supabase-js';

// Public values: safe to ship in the app. Data is protected by Row Level Security.
const SUPABASE_URL = 'https://tfhwvccqmwtbrhqqfcdn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TZH41kWfkyiUkPkrFUviwA_Ba1VYOqS';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
});

export const APP_URL = `${location.origin}${import.meta.env.BASE_URL}`;

// Turns a Supabase/Postgres error into a sentence a person can act on.
export function friendly(error) {
  if (!error) return '';
  const msg = error.message || String(error);
  if (/rate limit/i.test(msg)) return 'Too many emails sent. Wait a few minutes and try again.';
  if (/expired|invalid.*(otp|token)/i.test(msg)) return 'That code has expired or is wrong. Send a new one.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return "You're offline. Try again when you have reception.";
  return msg;
}
