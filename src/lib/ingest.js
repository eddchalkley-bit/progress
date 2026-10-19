// Parses the text the "Progress Sync" shortcut sends.
// One reading per line:  metric|start|end|value   (or metric|start|value)
//   steps|2026-10-17T00:00:00+01:00|2026-10-18T00:00:00+01:00|6420
//   sleep|2026-10-17T23:41:00+01:00|2026-10-18T00:12:00+01:00|Core
import { localDate, localHour, addDays, DEFAULT_TZ } from './time.js';

export const SUM_METRICS = new Set(['steps', 'energy', 'exercise', 'daylight', 'mindful', 'stand']);
export const AVG_METRICS = new Set(['rhr', 'hrv', 'hr', 'walkhr', 'resp', 'spo2', 'temp']);

const ALIASES = {
  resting: 'rhr', restinghr: 'rhr', 'resting heart rate': 'rhr',
  heartrate: 'hr', 'heart rate': 'hr',
  'heart rate variability': 'hrv',
  step: 'steps', 'step count': 'steps',
  'active energy': 'energy', activeenergy: 'energy', calories: 'energy',
  'exercise minutes': 'exercise', 'exercise time': 'exercise',
  'walking heart rate': 'walkhr', 'respiratory rate': 'resp',
  'blood oxygen': 'spo2', oxygen: 'spo2', 'sleep analysis': 'sleep',
  hrsample: 'hrs', 'heart rate sample': 'hrs', 'heart rate samples': 'hrs',
};

export function parseNum(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[^\d.,-]/g, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  return s === '' ? NaN : Number(s);
}

export function normStage(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (/^\d$/.test(s)) return ['inbed', 'asleep', 'awake', 'core', 'deep', 'rem'][Number(s)] || null;
  if (s.includes('awake')) return 'awake';
  if (s.includes('deep')) return 'deep';
  if (s.includes('rem')) return 'rem';
  if (s.includes('core') || s.includes('light')) return 'core';
  if (s.includes('bed')) return 'inbed';
  if (s.includes('sleep')) return 'asleep';
  return null;
}

function dateOf(str, tz) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(str);
  if (m) return m[1]; // ISO strings from Shortcuts carry the local date already
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : localDate(d, tz);
}

export function parseLines(text, tz = DEFAULT_TZ) {
  const quantities = new Map(); // "metric|date" -> {sum, count}
  const sleep = [];
  const hrSamples = [];
  let invalid = 0;
  const examplesInvalid = [];

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 3) { invalid++; if (examplesInvalid.length < 2) examplesInvalid.push(line); continue; }
    let metric = parts[0].toLowerCase();
    metric = ALIASES[metric] || metric;
    const start = parts[1];
    const end = parts.length === 3 ? parts[1] : parts[2];
    const value = parts.length === 3 ? parts[2] : parts.slice(3).join('|');

    if (metric === 'sleep') {
      const stage = normStage(value);
      const s = new Date(start), e = new Date(end);
      if (!stage || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) {
        invalid++; if (examplesInvalid.length < 2) examplesInvalid.push(line); continue;
      }
      sleep.push({ start_at: s.toISOString(), end_at: e.toISOString(), stage });
      continue;
    }
    if (metric === 'hrs') {
      const at = new Date(start), bpm = parseNum(value);
      if (Number.isNaN(at.getTime()) || Number.isNaN(bpm) || bpm < 30 || bpm > 230) { invalid++; continue; }
      hrSamples.push({ at: at.toISOString(), bpm: Math.round(bpm) });
      continue;
    }
    if (!SUM_METRICS.has(metric) && !AVG_METRICS.has(metric)) { invalid++; continue; }
    let num = parseNum(value);
    const date = dateOf(start, tz);
    if (!date || Number.isNaN(num)) { invalid++; if (examplesInvalid.length < 2) examplesInvalid.push(line); continue; }
    if (metric === 'spo2' && num <= 1) num *= 100;
    const key = `${metric}|${date}`;
    const agg = quantities.get(key) || { metric, date, sum: 0, count: 0 };
    agg.sum += num; agg.count += 1;
    quantities.set(key, agg);
  }

  // Each metric's oldest day in a batch may only be partly covered by the
  // "last N days" window, so it is dropped (it was saved in full by an earlier sync).
  const byMetric = new Map();
  for (const a of quantities.values()) {
    if (!byMetric.has(a.metric)) byMetric.set(a.metric, []);
    byMetric.get(a.metric).push(a);
  }
  const rows = [];
  for (const [metric, list] of byMetric) {
    list.sort((x, y) => x.date.localeCompare(y.date));
    const keep = list.length >= 3 ? list.slice(1) : list;
    for (const a of keep) {
      const value = SUM_METRICS.has(metric) ? a.sum : a.sum / a.count;
      rows.push({ date: a.date, metric, value: Math.round(value * 100) / 100 });
    }
  }

  // De-duplicate sleep samples within the batch.
  const seen = new Set();
  const sleepRows = sleep.filter((r) => {
    const k = `${r.start_at}|${r.end_at}|${r.stage}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const hrSeen = new Set();
  const hr = hrSamples.filter((x) => (hrSeen.has(x.at) ? false : (hrSeen.add(x.at), true)));
  return { rows, sleep: sleepRows, hrSamples: hr, invalid, examplesInvalid };
}

// Which night does a sleep segment belong to? Keyed by the morning you woke up.
export function nightOf(endDate, tz = DEFAULT_TZ) {
  const d = localDate(endDate, tz);
  const h = localHour(endDate, tz);
  if (h >= 18) return { key: addDays(d, 1), nap: false };
  if (h < 14) return { key: d, nap: false };
  return { key: d, nap: true };
}

function unionMinutes(intervals) {
  if (!intervals.length) return 0;
  const sorted = intervals.map((i) => [i[0], i[1]]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= ce) ce = Math.max(ce, e);
    else { total += ce - cs; cs = s; ce = e; }
  }
  total += ce - cs;
  return total / 60000;
}

// Turns raw sleep samples into nightly totals (union of overlapping sources).
export function summariseNights(samples, tz = DEFAULT_TZ) {
  const nights = new Map();
  for (const s of samples) {
    const start = new Date(s.start_at), end = new Date(s.end_at);
    const { key, nap } = nightOf(end, tz);
    if (!nights.has(key)) nights.set(key, { asleep: [], deep: [], rem: [], core: [], awake: [], inbed: [], nap: [] });
    const n = nights.get(key);
    const iv = [start.getTime(), end.getTime()];
    const isAsleep = ['core', 'deep', 'rem', 'asleep'].includes(s.stage);
    if (nap) { if (isAsleep) n.nap.push(iv); continue; }
    if (isAsleep) n.asleep.push(iv);
    if (n[s.stage]) n[s.stage].push(iv);
  }
  const out = [];
  for (const [date, n] of nights) {
    const asleep = unionMinutes(n.asleep);
    const inbed = unionMinutes(n.inbed);
    const sleepMin = asleep > 0 ? asleep : inbed;
    const push = (metric, v) => { if (v > 0 || (metric !== 'nap_min' && sleepMin > 0)) out.push({ date, metric, value: Math.round(v) }); };
    if (sleepMin > 0) {
      push('sleep_min', sleepMin);
      push('deep_min', unionMinutes(n.deep));
      push('rem_min', unionMinutes(n.rem));
      push('core_min', unionMinutes(n.core));
      push('awake_min', unionMinutes(n.awake));
      if (inbed > 0) push('inbed_min', inbed);
    }
    const napMin = unionMinutes(n.nap);
    if (napMin > 0) out.push({ date, metric: 'nap_min', value: Math.round(napMin) });
  }
  return out;
}
