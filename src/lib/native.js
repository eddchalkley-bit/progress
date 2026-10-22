// Native app (iPhone / Android): read Apple Health or Health Connect directly,
// so nobody has to build Shortcuts. Readings are turned into the same
// "metric|start|end|value" lines the Shortcut sends, and posted to /api/ingest —
// the server side doesn't change at all.
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
export const healthName = () => (platform() === 'android' ? 'Health Connect' : 'Apple Health');

// The bundled app has no server of its own, so API calls go to the live site.
export const API_BASE = isNative() ? (import.meta.env.VITE_API_BASE || 'https://progress-v38v.vercel.app') : '';

const READ = ['steps', 'calories', 'heartRate', 'restingHeartRate', 'heartRateVariability', 'sleep', 'respiratoryRate', 'oxygenSaturation'];

let healthMod;
async function Health() {
  if (!healthMod) healthMod = (await import('@capgo/capacitor-health')).Health;
  return healthMod;
}

// Local wall-clock ISO with offset (2026-10-22T07:12:00+01:00) — the server reads
// the first 10 characters as the local date, so UTC strings would land on the wrong day.
export function isoLocal(d) {
  const date = d instanceof Date ? d : new Date(d);
  const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}${off >= 0 ? '+' : '-'}${p(off / 60)}:${p(off % 60)}`;
}
const midnight = (daysAgo) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - daysAgo); return d; };

export async function healthAvailable() {
  if (!isNative()) return { available: false, reason: 'web' };
  try { return await (await Health()).isAvailable(); } catch (e) { return { available: false, reason: e.message }; }
}

export async function connectHealth() {
  const H = await Health();
  const avail = await H.isAvailable();
  if (!avail.available) throw new Error(platform() === 'android'
    ? 'Health Connect isn’t available. On Android 13 or older, install “Health Connect by Android” from the Play Store.'
    : `Apple Health isn’t available on this device (${avail.reason || 'unknown reason'}).`);
  return H.requestAuthorization({ read: READ, write: [], requestHistoryAccess: true });
}

async function safe(fn) { try { return await fn(); } catch { return []; } }

// Reads the last `days` days (one extra so the server's "drop the partial oldest day" rule is harmless).
export async function collectLines(days = 4) {
  const H = await Health();
  const start = midnight(days + 1), end = new Date();
  const range = { startDate: start.toISOString(), endDate: end.toISOString() };
  const lines = [];
  const dayLine = (metric, s) => {
    if (s.value == null || !Number.isFinite(Number(s.value))) return;
    const st = new Date(s.startDate);
    const en = new Date(st); en.setDate(en.getDate() + 1);
    lines.push(`${metric}|${isoLocal(st)}|${isoLocal(en)}|${Number(s.value)}`);
  };

  // Daily totals / averages (aggregated on the device)
  const agg = (dataType, aggregation) => safe(async () => (await H.queryAggregated({ ...range, dataType, bucket: 'day', aggregation })).samples);
  (await agg('steps', 'sum')).forEach((s) => dayLine('steps', s));
  (await agg('calories', 'sum')).forEach((s) => dayLine('energy', s));
  (await agg('heartRate', 'average')).forEach((s) => dayLine('hr', s));

  // Individual readings (the server averages them per day)
  const read = (dataType, from = start) => safe(async () => (await H.readSamples({ dataType, startDate: from.toISOString(), endDate: end.toISOString(), limit: 10000, ascending: true })).samples);
  // Apple Exercise Time (iOS only) — the server adds the pieces up per day.
  if (platform() === 'ios') (await read('exerciseTime')).forEach((s) => { if (s.value != null) lines.push(`exercise|${isoLocal(s.startDate)}|${isoLocal(s.endDate || s.startDate)}|${s.value}`); });
  for (const [type, metric] of [['restingHeartRate', 'rhr'], ['heartRateVariability', 'hrv'], ['respiratoryRate', 'resp'], ['oxygenSaturation', 'spo2']]) {
    (await read(type)).forEach((s) => { if (s.value != null) lines.push(`${metric}|${isoLocal(s.startDate)}|${isoLocal(s.endDate || s.startDate)}|${s.value}`); });
  }

  // Sleep: every stage segment (Core/Deep/REM/Awake/In bed)
  for (const s of await read('sleep')) {
    const segs = s.stages?.length ? s.stages : [{ startDate: s.startDate, endDate: s.endDate, stage: s.sleepState || 'asleep' }];
    for (const g of segs) lines.push(`sleep|${isoLocal(g.startDate)}|${isoLocal(g.endDate)}|${g.stage === 'inBed' ? 'inbed' : g.stage === 'light' ? 'core' : g.stage}`);
  }

  // Every heart-rate reading from the last day, for spike detection
  const hrs = (await read('heartRate', new Date(Date.now() - 26 * 3600e3)))
    .filter((s) => s.value != null)
    .map((s) => `hrs|${isoLocal(s.startDate)}|${isoLocal(s.startDate)}|${Math.round(s.value)}`);

  return { lines, hrs };
}

const LAST_KEY = 'progress_native_sync';
export function lastNativeSync() { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch { return null; } }

// Reads Health and posts it. `post(path, body)` is the app's API caller (carries the token).
export async function syncHealth(post, { days = 4 } = {}) {
  const { lines, hrs } = await collectLines(days);
  const results = [];
  if (lines.length) results.push(await post('/api/ingest', { lines: lines.join('\n'), device: `${platform()}-app` }));
  for (let i = 0; i < hrs.length; i += 3000) {
    results.push(await post('/api/ingest', { lines: hrs.slice(i, i + 3000).join('\n'), device: `${platform()}-app` }));
  }
  const summary = { at: new Date().toISOString(), readings: lines.length + hrs.length, days };
  try { localStorage.setItem(LAST_KEY, JSON.stringify(summary)); } catch { /* ignore */ }
  return { ...summary, results };
}

// Lets tests supply a fake Health plugin.
export function __setHealthForTests(h) { healthMod = h; }
