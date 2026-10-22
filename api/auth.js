// POST /api/auth — accounts.  Body: { action, ... }
//   signup  { email, password, code? }  → session   (code only if BETA_CODE is set in Vercel)
//   login   { email, password }         → session
//   refresh { refresh_token }           → session
//   token   (signed in)                 → a new personal sync token for Shortcuts / the watch
//   claim   (signed in) { token }       → moves the original single-user data into this account
//   delete  (signed in) { confirm: 'DELETE' } → deletes the account and all its data
// Uses Supabase Auth through the server's existing keys, so no extra settings are needed.
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cors, readBody, db, whoIs, hashToken, isLegacyToken, fail } from './_lib.js';

const OWNED = ['daily_metrics', 'sleep_samples', 'checkins', 'quick_logs', 'syncs', 'hr_samples', 'hr_events', 'screen_sessions'];

// A throwaway client per request, so one person's session never leaks into another's.
let makeAuthClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const authClient = () => makeAuthClient();
export function __setAuthClientForTests(fn) { makeAuthClient = fn; }

const session = (s, user) => ({
  access_token: s.access_token,
  refresh_token: s.refresh_token,
  expires_at: s.expires_at,
  email: user?.email ?? s.user?.email ?? null,
});

const cleanEmail = (e) => String(e || '').trim().toLowerCase();
const friendly = (msg) => {
  if (/invalid login/i.test(msg)) return 'That email and password don’t match.';
  if (/already (been )?registered|already exists/i.test(msg)) return 'There’s already an account with that email — sign in instead.';
  if (/password/i.test(msg) && /(characters|short|weak)/i.test(msg)) return 'Choose a password of at least 8 characters.';
  return msg;
};

export default async function handler(req, res) {
  if (!cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const b = readBody(req);
    const action = String(b.action || '');

    if (action === 'signup') {
      const email = cleanEmail(b.email), password = String(b.password || '');
      if (process.env.BETA_CODE && String(b.code || '').trim().toLowerCase() !== process.env.BETA_CODE.trim().toLowerCase()) {
        return res.status(403).json({ error: 'Progress is in a private test. Enter the invite code you were given.' });
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
      if (password.length < 8) return res.status(400).json({ error: 'Choose a password of at least 8 characters.' });
      // Confirmed straight away: Supabase's built-in email only reaches its own team,
      // so confirmation emails would never arrive until a mail provider is set up.
      const { error: cErr } = await db().auth.admin.createUser({ email, password, email_confirm: true });
      if (cErr) return res.status(400).json({ error: friendly(cErr.message) });
      const { data, error } = await authClient().auth.signInWithPassword({ email, password });
      if (error) return res.status(400).json({ error: friendly(error.message) });
      return res.status(200).json({ ok: true, session: session(data.session, data.user) });
    }

    if (action === 'login') {
      const { data, error } = await authClient().auth.signInWithPassword({ email: cleanEmail(b.email), password: String(b.password || '') });
      if (error) return res.status(401).json({ error: friendly(error.message) });
      return res.status(200).json({ ok: true, session: session(data.session, data.user) });
    }

    if (action === 'refresh') {
      const { data, error } = await authClient().auth.refreshSession({ refresh_token: String(b.refresh_token || '') });
      if (error || !data?.session) return res.status(401).json({ error: 'Please sign in again.' });
      return res.status(200).json({ ok: true, session: session(data.session, data.user) });
    }

    // Everything below needs a signed-in app session.
    const who = await whoIs(req).catch(() => null);
    if (!who || who.via !== 'session') return res.status(401).json({ error: 'Please sign in again.' });
    const sb = db();

    if (action === 'token') {
      const token = randomBytes(24).toString('hex');
      await sb.from('api_tokens').delete().eq('user_id', who.userId).eq('kind', 'shortcut');
      const { error } = await sb.from('api_tokens').insert({ token_hash: hashToken(token), user_id: who.userId, kind: 'shortcut' });
      if (error) throw error;
      return res.status(200).json({ ok: true, token });
    }

    if (action === 'claim') {
      const legacy = String(b.token || '').replace(/^\s*bearer\s+/i, '').trim();
      if (!isLegacyToken(legacy)) return res.status(400).json({ error: 'That isn’t the original Progress token (PROGRESS_TOKEN in Vercel).' });
      const { data: taken } = await sb.from('api_tokens').select('user_id').eq('token_hash', hashToken(legacy)).maybeSingle();
      if (taken && taken.user_id !== who.userId) return res.status(409).json({ error: 'That data has already been linked to another account.' });
      const moved = {};
      for (const t of OWNED) {
        const { count, error } = await sb.from(t).update({ user_id: who.userId }, { count: 'exact' }).is('user_id', null);
        if (error) throw error;
        moved[t] = count || 0;
      }
      if (!taken) {
        const { error } = await sb.from('api_tokens').insert({ token_hash: hashToken(legacy), user_id: who.userId, kind: 'legacy' });
        if (error) throw error;
      }
      const days = moved.daily_metrics + moved.checkins;
      return res.status(200).json({ ok: true, moved, message: days ? 'Your existing data is now in your account. Your shortcuts keep working with the same token.' : 'Linked. There was no unlinked data to move.' });
    }

    if (action === 'delete') {
      if (b.confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm.' });
      for (const t of OWNED) await sb.from(t).delete().eq('user_id', who.userId);
      await sb.from('api_tokens').delete().eq('user_id', who.userId);
      const { error } = await sb.auth.admin.deleteUser(who.userId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    fail(res, err);
  }
}
