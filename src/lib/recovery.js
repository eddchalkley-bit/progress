// Recovery, activity and a body-signals health check — all on ONE scale: 100% = your normal.
// Baseline = your normal: the average of your own last 60 days (it firms up after 14).
// Recovery = how recharged your body is this morning: last night's HRV (60%) and resting
//   HR (40%) compared with that baseline. 100% = a normal night, 80% = below par.
//   Set once per day; it doesn't change as the day goes on.
// Activity = how much you did (active energy, or steps if energy is missing) as a % of a
//   usual day for you. Today's limit follows recovery (80% recovered → about 80% of a
//   usual day), capped at 110% — it's a ceiling, never a target to reach.

const WINDOW = 60;
export const FULL_BASELINE = 14;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

function priorValues(days, i, key, window = WINDOW) {
  const out = [];
  for (let k = Math.max(0, i - window); k < i; k++) {
    const v = days[k]?.[key];
    if (v != null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function recoveryLevel(score) {
  if (score == null) return null;
  return score >= 95 ? 'good' : score >= 80 ? 'moderate' : 'low';
}
export function recoveryLabel(score) {
  if (score == null) return '';
  return score >= 105 ? 'Above your normal' : score >= 95 ? 'Your normal' : score >= 80 ? 'Below your normal' : 'Well below your normal';
}
export const LEVEL_LABEL = { good: 'Normal or better', moderate: 'Below normal', low: 'Well below normal' };

export function recoveryFor(days, i) {
  const d = days[i];
  if (!d || d.hrv == null || d.rhr == null) return null;
  const hrvBase = priorValues(days, i, 'hrv');
  const rhrBase = priorValues(days, i, 'rhr');
  if (hrvBase.length < 3 || rhrBase.length < 3) return null;
  const hb = avg(hrvBase), rb = avg(rhrBase);
  const hrvPct = (d.hrv - hb) / hb;     // higher HRV is better
  const rhrPct = (d.rhr - rb) / rb;     // lower resting HR is better
  const hrvPart = clamp(50 + hrvPct * 160, 0, 100);
  const rhrPart = clamp(50 - rhrPct * 400, 0, 100);
  const raw = clamp(0.6 * hrvPart + 0.4 * rhrPart, 0, 100); // 50 = exactly your normal
  const score = Math.round(clamp(100 + (raw - 50) * 0.8, 60, 140)); // 100% = your normal
  return {
    score, level: recoveryLevel(score),
    hrv: d.hrv, hrvAvg: hb, hrvPct, rhr: d.rhr, rhrAvg: rb, rhrPct,
    baselineDays: Math.min(hrvBase.length, rhrBase.length),
    reason: recoveryReason(hrvPct, rhrPct),
  };
}

function recoveryReason(hrvPct, rhrPct) {
  const hrvLow = hrvPct <= -0.1, hrvHigh = hrvPct >= 0.1;
  const rhrHigh = rhrPct >= 0.04, rhrLow = rhrPct <= -0.03;
  if (hrvLow && rhrHigh) return 'HRV is down and resting heart rate is up — your body is under strain. Keep today very light.';
  if (hrvLow) return `HRV is below your average${rhrLow ? ' even though resting heart rate is low' : ''}, so recovery is only partial. Pace carefully.`;
  if (rhrHigh) return 'Resting heart rate is up on your average, which can mean your body is still recovering. Pace carefully.';
  if (hrvHigh && !rhrHigh) return 'HRV is above your average and resting heart rate is steady — a better night. Still stay within your limits.';
  return 'Both signals are close to your normal.';
}

// Activity as a % of a usual day for you (100 = usual).
function exertionFor(days, i) {
  const d = days[i];
  const key = d?.energy != null ? 'energy' : d?.steps != null ? 'steps' : null;
  if (!key) return null;
  const base = priorValues(days, i, key).filter((v) => v > 0);
  if (base.length < 3) return null;
  const sorted = [...base].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  if (!med) return null;
  return { value: Math.round(clamp((d[key] / med) * 100, 0, 200)), basis: key };
}

// The day's limit follows recovery (% of a usual day), never more than 110%.
export const limitFor = (score) => Math.min(110, Math.round(score));

export function balanceDays(days, n = 7) {
  const out = [];
  for (let i = Math.max(0, days.length - n); i < days.length; i++) {
    const r = recoveryFor(days, i);
    const e = exertionFor(days, i);
    const limit = r ? limitFor(r.score) : null;
    out.push({
      date: days[i].date, recovery: r?.score ?? null, level: r?.level ?? null,
      exertion: e?.value ?? null, basis: e?.basis ?? null, limit,
      over: limit != null && e != null ? e.value > limit + 10 : null,
      partial: i === days.length - 1,
    });
  }
  return out;
}

export function balanceSummary(rows) {
  const full = rows.filter((r) => !r.partial && r.over != null);
  const over = full.filter((r) => r.over).length;
  const lowDays = full.filter((r) => r.level === 'low');
  const lowOver = lowDays.filter((r) => r.over).length;
  let verdict, tone;
  if (!full.length) { verdict = 'Building'; tone = 'none'; }
  else if (over === 0) { verdict = 'Pacing well'; tone = 'good'; }
  else if (over <= Math.max(1, Math.floor(full.length / 4))) { verdict = 'Mostly within limits'; tone = 'good'; }
  else { verdict = 'Pushing past your limits'; tone = 'warn'; }
  let text;
  if (!full.length) text = 'Needs a few days of recovery and activity data.';
  else if (over === 0) text = full.length === 1 ? 'You stayed within your limit yesterday.' : `You stayed within your limit on all ${full.length} days. Keeping it this way gives your body the best chance to recover.`;
  else if (lowOver) text = `You went over on ${over} of ${full.length} days, including ${lowOver === 1 ? 'a low-recovery day' : `${lowOver} low-recovery days`}. Those are the days to protect most.`;
  else text = `You went over on ${over} of ${full.length} days. Try to bring the busier days down, especially when recovery is moderate or low.`;
  return { over, total: full.length, verdict, tone, text };
}

// Body signals vs your normal range (mean ± 1.5 SD of the last 60 days, with sensible minimum widths).
const SIGNALS = [
  { key: 'hrv', label: 'HRV', unit: 'ms', better: 'up', minBand: 3, fmt: (v) => Math.round(v) },
  { key: 'rhr', label: 'Resting HR', unit: 'bpm', better: 'down', minBand: 2, fmt: (v) => Math.round(v) },
  { key: 'resp', label: 'Breathing', unit: '/min', better: 'none', minBand: 0.7, fmt: (v) => v.toFixed(1) },
  { key: 'temp', label: 'Wrist temp', unit: '°C', better: 'none', minBand: 0.3, fmt: (v) => v.toFixed(1), delta: true },
  { key: 'spo2', label: 'Blood oxygen', unit: '%', better: 'up', minBand: 1.5, fmt: (v) => Math.round(v) },
];

export function healthCheck(days) {
  const i = days.length - 1;
  const rows = [];
  for (const s of SIGNALS) {
    let j = i;
    if (days[j]?.[s.key] == null) j = i - 1;
    const v = days[j]?.[s.key];
    if (v == null) { rows.push({ ...s, value: null, status: 'nodata' }); continue; }
    const base = priorValues(days, j, s.key);
    if (base.length < 5) { rows.push({ ...s, value: v, status: 'learning' }); continue; }
    const m = avg(base);
    const sd = Math.sqrt(avg(base.map((x) => (x - m) ** 2)));
    const band = Math.max(1.5 * sd, s.minBand);
    const diff = v - m;
    let status = 'normal';
    if (Math.abs(diff) > band) {
      const good = (s.better === 'up' && diff > 0) || (s.better === 'down' && diff < 0);
      status = good ? 'better' : 'off';
    }
    rows.push({ ...s, value: v, mean: m, diff, status });
  }
  const shown = rows.filter((r) => r.status !== 'nodata');
  const off = shown.filter((r) => r.status === 'off');
  const summary = !shown.length ? null
    : off.length ? `${off.map((r) => r.label).join(' and ')} ${off.length === 1 ? 'is' : 'are'} outside your normal range. If this lasts a few days, or you feel unwell, take it easy and consider checking in with your GP.`
    : shown.some((r) => r.status === 'learning') ? 'Within your normal range so far — ranges firm up after a week of data.'
    : 'All within your normal range or better.';
  return { rows, summary };
}
