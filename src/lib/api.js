import { API_BASE } from './native.js';

const KEY = 'progress_token';
const DEMO_KEY = 'progress_demo';

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
export function getDemoPref() {
  try { return localStorage.getItem(DEMO_KEY) === '1'; } catch { return false; }
}
export function setDemoPref(on) {
  try { on ? localStorage.setItem(DEMO_KEY, '1') : localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
}

async function call(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) },
  });
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
