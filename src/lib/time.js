// Date helpers shared by the app and the API. Dates are 'YYYY-MM-DD' strings in local time.

export const DEFAULT_TZ = 'Europe/London';

export function localDate(date = new Date(), tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function localHour(date, tz = DEFAULT_TZ) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(date);
  return Number(h);
}

// Minutes since local midnight (0–1439).
export function localMinutes(date, tz = DEFAULT_TZ) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).reduce((o, x) => ((o[x.type] = x.value), o), {});
  return Number(p.hour) * 60 + Number(p.minute);
}

// Clock time from minutes relative to midnight (negative = the evening before): -27 → "23:33".
export function fmtClock(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
}

export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fmtMinutes(min) {
  if (min == null || Number.isNaN(min)) return '–';
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, '0')}m` : `${r}m`;
}

export function fmtDay(dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}
