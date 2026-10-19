// Shared helpers for the API functions. Files starting with "_" are not deployed as endpoints.
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
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

export function authorised(req) {
  const expected = process.env.PROGRESS_TOKEN || '';
  const header = String(req.headers.authorization || '');
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : String(req.headers['x-progress-token'] || '');
  if (!expected || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function guard(req, res, methods) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methods.includes(req.method)) { res.status(405).json({ error: 'Method not allowed' }); return false; }
  if (!authorised(req)) { res.status(401).json({ error: 'Wrong or missing token' }); return false; }
  return true;
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

export async function loadAll(days = 400) {
  const sb = db();
  const since = addDays(localDate(new Date(), TZ), -days);
  const [metrics, checkins, quick, syncs, research, hrEvents, screens] = await Promise.all([
    fetchAll(() => sb.from('daily_metrics').select('date,metric,value').gte('date', since).order('date')),
    fetchAll(() => sb.from('checkins').select('*').gte('date', since).order('date')),
    fetchAll(() => sb.from('quick_logs').select('at,date,energy,note').gte('date', since).order('at')),
    sb.from('syncs').select('at,source,lines,metrics').order('at', { ascending: false }).limit(10)
      .then(({ data, error }) => { if (error) throw error; return data; }),
    sb.from('research_updates').select('*').order('checked_at', { ascending: false }).limit(40)
      .then(({ data, error }) => (error ? [] : data)), // table may not exist yet
    sb.from('hr_events').select('id,start_at,end_at,peak,minutes,source,tag,note').gte('start_at', addDays(localDate(new Date(), TZ), -60) + 'T00:00:00Z').order('start_at')
      .then(({ data, error }) => (error ? [] : data)),
    sb.from('screen_sessions').select('kind,start_at,end_at').gte('start_at', addDays(localDate(new Date(), TZ), -14) + 'T00:00:00Z').order('start_at')
      .then(({ data, error }) => (error ? [] : data)),
  ]);
  return { metrics, checkins, quick, syncs, research, hr_events: hrEvents, screen_sessions: screens };
}

export function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: err?.message || String(err) });
}
