// Heart-rate spikes: detection from raw Apple Watch readings, tag vocabulary, and summaries.
import { localDate, DEFAULT_TZ } from './time.js';

export const TAGS = [
  { id: 'social', label: 'Social', idea: 'Keep visits and calls shorter, sit down while talking, and plan quiet time afterwards.' },
  { id: 'screens', label: 'Screens', idea: 'Take a screen break every 20–30 minutes and avoid scrolling in bed.' },
  { id: 'driving', label: 'Driving', idea: 'Keep trips short, break longer journeys, and be a passenger where you can.' },
  { id: 'walking', label: 'Walking / moving', idea: 'Shorter trips with a sit-down halfway. Stop before your heart rate climbs.' },
  { id: 'chores', label: 'Chores / standing', idea: 'Sit for tasks where you can — a perching stool in the kitchen helps — and split jobs up.' },
  { id: 'shower', label: 'Shower / dressing', idea: 'Try a shower stool, cooler water, and a rest straight after.' },
  { id: 'stress', label: 'Stress', idea: 'Slow breathing with a longer out-breath for a few minutes can help your heart rate settle.' },
  { id: 'eating', label: 'Eating', idea: 'Smaller meals more often are often easier on the body than one big meal.' },
  { id: 'other', label: 'Other', idea: '' },
  { id: 'unsure', label: 'Not sure', idea: '' },
];
export const TAG_BY_ID = Object.fromEntries(TAGS.map((t) => [t.id, t]));

export function normaliseTag(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  for (const t of TAGS) if (s === t.id || s === t.label.toLowerCase()) return t.id;
  for (const t of TAGS) if (t.label.toLowerCase().startsWith(s) || s.startsWith(t.label.toLowerCase().split(' ')[0])) return t.id;
  if (/exercis|walk|move|stairs/.test(s)) return 'walking';
  if (/talk|friend|people|visit|call|meeting/.test(s)) return 'social';
  if (/phone|tv|laptop|computer|screen/.test(s)) return 'screens';
  if (/car|drive/.test(s)) return 'driving';
  return 'other';
}

// samples: [{at: ISO string, bpm: number}] sorted or not. Returns runs above the ceiling.
// A spike = at least two readings at/above the ceiling within 6 minutes of each other,
// or a single reading 15+ bpm over it. Spikes less than 15 minutes apart are merged.
export function detectSpikes(samples, ceiling) {
  if (!ceiling || !samples.length) return [];
  const s = samples.map((x) => ({ t: new Date(x.at).getTime(), bpm: Number(x.bpm) }))
    .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.bpm)).sort((a, b) => a.t - b.t);
  const runs = [];
  let cur = null;
  for (const x of s) {
    if (x.bpm >= ceiling) {
      if (cur && x.t - cur.last <= 6 * 60000) { cur.last = x.t; cur.vals.push(x.bpm); }
      else { if (cur) runs.push(cur); cur = { first: x.t, last: x.t, vals: [x.bpm] }; }
    }
  }
  if (cur) runs.push(cur);
  const kept = runs.filter((r) => r.vals.length >= 2 || Math.max(...r.vals) >= ceiling + 15);
  const merged = [];
  for (const r of kept) {
    const prev = merged[merged.length - 1];
    if (prev && r.first - prev.last <= 15 * 60000) { prev.last = r.last; prev.vals.push(...r.vals); }
    else merged.push({ ...r, vals: [...r.vals] });
  }
  return merged.map((r) => ({
    start_at: new Date(r.first).toISOString(),
    end_at: new Date(r.last + 60000).toISOString(),
    peak: Math.round(Math.max(...r.vals)),
    avg: Math.round(r.vals.reduce((a, b) => a + b, 0) / r.vals.length),
    minutes: Math.max(1, Math.round((r.last + 60000 - r.first) / 60000)),
  }));
}

export function minutesByDay(events, tz = DEFAULT_TZ) {
  const out = {};
  for (const e of events) {
    const d = localDate(new Date(e.start_at), tz);
    out[d] = (out[d] || 0) + (e.minutes || 0);
  }
  return out;
}

export function timeLabel(iso, tz) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

export function eventLabel(e, tz) {
  const day = localDate(new Date(e.start_at), tz) === localDate(new Date(), tz) ? '' : 'Yesterday ';
  return `${day}${timeLabel(e.start_at, tz)} · ${e.minutes} min · peak ${e.peak} bpm`;
}

// Summary by tag over a window of days (ISO date strings inclusive).
export function triggerSummary(events, fromDate, tz) {
  const rows = new Map();
  let untagged = 0, total = 0, totalMin = 0;
  for (const e of events || []) {
    if (localDate(new Date(e.start_at), tz) < fromDate) continue;
    if (e.source === 'manual') continue;
    total++; totalMin += e.minutes || 0;
    if (!e.tag) { untagged++; continue; }
    const r = rows.get(e.tag) || { tag: e.tag, count: 0, minutes: 0, peaks: [] };
    r.count++; r.minutes += e.minutes || 0; r.peaks.push(e.peak);
    rows.set(e.tag, r);
  }
  const list = [...rows.values()].map((r) => ({ ...r, avgPeak: Math.round(r.peaks.reduce((a, b) => a + b, 0) / r.peaks.length) }))
    .sort((a, b) => b.minutes - a.minutes || b.count - a.count);
  return { list, untagged, total, totalMin };
}
