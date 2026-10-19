// Screen time: phone (from app open/close automations) and laptop / work (from a Focus or a toggle),
// with manual check-in entries as the fallback.
import { localDate, DEFAULT_TZ } from './time.js';

export const CAPS = { phone: 30, laptop: 600 }; // minutes: an unclosed session is cut off after this

// Hours of screen time for a day: tracked minutes win, check-in entries fill gaps.
export function screenHours(d) {
  const c = d.checkin || {};
  const phone = d.phone_min != null ? d.phone_min / 60 : c.phone_hours != null ? Number(c.phone_hours) : null;
  const laptop = d.laptop_min != null ? d.laptop_min / 60 : c.laptop_hours != null ? Number(c.laptop_hours) : null;
  let total = null;
  if (phone != null || laptop != null) total = (phone || 0) + (laptop || 0);
  else if (c.screen_hours != null) total = Number(c.screen_hours);
  return { phone, laptop, total, tracked: d.phone_min != null || d.laptop_min != null };
}

export function sessionMinutes(s, now = Date.now()) {
  const start = new Date(s.start_at).getTime();
  const end = s.end_at ? new Date(s.end_at).getTime() : Math.min(now, start + CAPS[s.kind] * 60000);
  return Math.max(0, (end - start) / 60000);
}

export function minutesByDay(sessions, kind, tz = DEFAULT_TZ, now = Date.now()) {
  const out = {};
  for (const s of sessions) {
    if (s.kind !== kind) continue;
    const d = localDate(new Date(s.start_at), tz);
    out[d] = (out[d] || 0) + sessionMinutes(s, now);
  }
  return out;
}

export function openLaptop(sessions) {
  return (sessions || []).filter((s) => s.kind === 'laptop' && !s.end_at).sort((a, b) => b.start_at.localeCompare(a.start_at))[0] || null;
}

export function fmtHM(min) {
  if (min == null) return '–';
  const m = Math.round(min), h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
