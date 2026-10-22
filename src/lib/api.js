import { API_BASE } from './native.js';

const KEY = 'progress_token';          // original single-user token (still works)
const SESSION_KEY = 'progress_session'; // signed-in account
const DEMO_KEY = 'progress_demo';

// ---------- original token ----------
export function getToken() {
  try { return cleanToken(localStorage.getItem(KEY)); } catch { return ''; }
}
export function cleanToken(t) {
  return String(t || '').replace(/^\s*(authorization:)?\s*bearer\s+/i, '').replace(/["'\s]/g, '');
}
export function setToken(t) {
  t = cleanToken(t);
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

// ---------- account session ----------
export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function setSession(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('progress-session'));
}
export function signOut() { setSession(null); setToken(''); }

export function getDemoPref() {
  try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
}
export function setDemoPref(on) {
  try { on ? localStorage.setItem(DEMO_KEY, '1') : localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
}

const authHeader = () => {
  const s = getSession();
  const t = s?.access_token || getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function raw(path, opts = {}) {
  return fetch(API_BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...authHeader(), ...(opts.headers || {}) } });
}

let refreshing = null;
async function refresh() {
  const s = getSession();
  if (!s?.refresh_token) return false;
  refreshing = refreshing || (async () => {
    const r = await fetch(API_BASE + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh', refresh_token: s.refresh_token }) });
    if (!r.ok) { setSession(null); return false; }
    setSession((await r.json()).session);
    return true;
  })().finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}

async function call(path, opts = {}) {
  // Refresh a session that is about to expire (access tokens last an hour).
  const s = getSession();
  if (s?.expires_at && s.expires_at * 1000 - Date.now() < 60e3) await refresh();
  let res = await raw(path, opts);
  if (res.status === 401 && getSession() && (await refresh())) res = await raw(path, opts);
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error; } catch { /* not json */ }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : res.text();
}

export const fetchData = () => call('/api/data');
export const saveCheckin = (c) => call('/api/checkin', { method: 'POST', body: JSON.stringify(c) });
export const refreshResearch = () => call('/api/research-refresh', { method: 'POST' });
export const reviewResearch = (id) => call('/api/research-review', { method: 'POST', body: JSON.stringify({ id }) });
export const tagSpike = (id, tag) => call('/api/tag', { method: 'POST', body: JSON.stringify({ id, tag }) });
export const rebuildSleep = () => call('/api/sleep-rebuild', { method: 'POST' });
export const post = (path, body) => call(path, { method: 'POST', body: JSON.stringify(body) });

// ---------- accounts ----------
async function authCall(body, { signedIn = false } = {}) {
  if (signedIn) return call('/api/auth', { method: 'POST', body: JSON.stringify(body) });
  const r = await fetch(API_BASE + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
export async function signIn(email, password) {
  const r = await authCall({ action: 'login', email, password });
  setSession(r.session);
  return r.session;
}
export async function signUp(email, password, code) {
  const r = await authCall({ action: 'signup', email, password, code });
  setSession(r.session);
  return r.session;
}
export const createSyncToken = () => authCall({ action: 'token' }, { signedIn: true }).then((r) => r.token);
export const linkExistingData = (token) => authCall({ action: 'claim', token: cleanToken(token) }, { signedIn: true });
export async function deleteAccount() {
  await authCall({ action: 'delete', confirm: 'DELETE' }, { signedIn: true });
  signOut();
}
