// Shared helpers for the API functions. Files starting with "_" are not deployed as endpoints.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual, createHash } from 'node:crypto';
import { addDays, localDate, DEFAULT_TZ } from '../src/lib/time.js';

export const TZ = process.env.PROGRESS_TZ || DEFAULT_TZ;

let client;
export function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

function bearer(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-progress-token'] || '').trim();
}
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
const looksLikeJwt = (t) => /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(t);

// The original single-user token (PROGRESS_TOKEN in Vercel). Until it is linked to an
// account it reads and writes the rows that have no owner yet (user_id IS NULL).
export function isLegacyToken(given) {
  const expected = process.env.PROGRESS_TOKEN || '';
  if (!expected || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Who is calling?  → { userId, email?, via: 'session' | 'token' | 'legacy' } or null.
//   session: the app, signed in (Supabase access token)
//   token:   a personal sync token, used by Shortcuts and the watch
//   legacy:  PROGRESS_TOKEN before it has been linked to an account
export async function whoIs(req) {
  const tok = bearer(req);
  if (!tok) return null;
  if (looksLikeJwt(tok)) {
    const { data, error } = await db().auth.getUser(tok);
    if (error || !data?.user) return null;
    return { userId: data.user.id, email: data.user.email, via: 'session' };
  }
  const { data: row } = await db().from('api_tokens').select('user_id').eq('token_hash', hashToken(tok)).maybeSingle();
  if (row?.user_id) return { userId: row.user_id, via: 'token' };
  if (isLegacyToken(tok)) return { userId: null, via: 'legacy' };
  return null;
}

// Table access limited to one person's rows. Every read and write goes through this.
export function own(who) {
  const sb = db();
  const scope = (q) => (who.userId ? q.eq('user_id', who.userId) : q.is('user_id', null));
  const stamp = (r) => (Array.isArray(r) ? r.map((x) => ({ ...x, user_id: who.userId })) : { ...r, user_id: who.userId });
  return (table) => ({
    select: (cols, opts) => scope(sb.from(table).select(cols, opts)),
    insert: (rows) => sb.from(table).insert(stamp(rows)),
    upsert: (rows, opts = {}) => sb.from(table).upsert(stamp(rows), { ...opts, ...(opts.onConflict ? { onConflict: `user_id,${opts.onConflict}` } : {}) }),
    update: (fields) => scope(sb.from(table).update(fields)),
    delete: () => scope(sb.from(table).delete()),
  });
}

// The iPhone / Android app runs from capacitor://localhost or https://localhost.
const APP_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost', 'ionic://localhost']);

export function cors(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin && APP_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
  return true;
}

// Returns the caller (see whoIs) or null after sending an error response.
export async function guard(req, res, methods) {
  if (!cors(req, res)) return null;
  if (!methods.includes(req.method)) { res.status(405).json({ error: 'Method not allowed' }); return null; }
  let who = null;
  try { who = await whoIs(req); } catch { who = null; }
  if (!who) { res.status(401).json({ error: 'Please sign in again (wrong or expired token)' }); return null; }
  return who;
}

export function readBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return { _text: b }; }
  }
  if (Buffer.isBuffer(b)) {
    const s = b.toString('utf8');
    try { return JSON.parse(s); } catch { return { _text: s }; }
  }
  return b;
}

// Supabase returns max 1000 rows per request, so page through.
export async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadAll(who, days = 400) {
  const sb = db();
  const T = own(who);
  const since = addDays(localDate(new Date(), TZ), -days);
  const [metrics, checkins, quick, syncs, research, hrEvents, screens] = await Promise.all([
    fetchAll(() => T('daily_metrics').select('date,metric,value').gte('date', since).order('date')),
    fetchAll(() => T('checkins').select('*').gte('date', since).order('date')),
    fetchAll(() => T('quick_logs').select('at,date,energy,note').gte('date', since).order('at')),
    T('syncs').select('at,source,lines,metrics').order('at', { ascending: false }).limit(10)
      .then(({ data, error }) => { if (error) throw error; return data; }),
    sb.from('research_updates').select('*').order('checked_at', { ascending: false }).limit(40)
      .then(({ data, error }) => (error ? [] : data)), // shared research, not personal
    T('hr_events').select('id,start_at,end_at,peak,minutes,source,tag,note').gte('start_at', addDays(localDate(new Date(), TZ), -60) + 'T00:00:00Z').order('start_at')
      .then(({ data, error }) => (error ? [] : data)),
    T('screen_sessions').select('kind,start_at,end_at').gte('start_at', addDays(localDate(new Date(), TZ), -14) + 'T00:00:00Z').order('start_at')
      .then(({ data, error }) => (error ? [] : data)),
  ]);
  return { metrics, checkins, quick, syncs, research, hr_events: hrEvents, screen_sessions: screens, account: { email: who.email || null, via: who.via, linked: who.userId != null } };
}

export function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: err?.message || String(err) });
}

// Test hook: lets the end-to-end tests run the API against a local database.
export function __setDbForTests(c) { client = c; }
