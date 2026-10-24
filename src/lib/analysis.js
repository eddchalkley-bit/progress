// Progress analysis — pure functions, used by the app and by /api/status.
// Symptom score: 0–10, higher = worse. Every comparison is against YOUR OWN rolling baseline.
import { addDays, dateRange, daysBetween, fmtMinutes, fmtClock } from './time.js';
import { screenHours } from './screens.js';

export const SYMPTOMS = [
  { key: 'fatigue', label: 'Fatigue' },
  { key: 'brain_fog', label: 'Brain fog' },
  { key: 'breath', label: 'Breathlessness' },
  { key: 'aches', label: 'Aches & pain' },
  { key: 'heart', label: 'Palpitations / dizziness' },
];

const BASELINE_WINDOW = 28;
const MIN_DAYS_FOR_STATUS = 7;
const MIN_DAYS_FOR_PATTERNS = 14;

// ---------- small stats helpers ----------
const nums = (arr) => arr.filter((v) => v !== null && v !== undefined && Number.isFinite(v));
export function mean(arr) { const a = nums(arr); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
export function median(arr) { return percentile(arr, 0.5); }
export function percentile(arr, p) {
  const a = nums(arr).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
function ranks(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
export function spearman(x, y) {
  if (x.length < 3) return 0;
  const rx = ranks(x), ry = ranks(y);
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
const round = (v, step = 1) => (v == null ? null : Number((Math.round(v / step) * step).toFixed(2)));
const fmtInt = (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-GB'));

// ---------- assemble one row per day ----------
export function buildDays(data, today) {
  const map = new Map();
  const get = (d) => { if (!map.has(d)) map.set(d, { date: d }); return map.get(d); };
  for (const m of data.metrics || []) get(m.date)[m.metric] = Number(m.value);
  for (const c of data.checkins || []) get(c.date).checkin = c;
  for (const q of data.quick || []) {
    const d = get(q.date);
    (d.quick = d.quick || []).push(q);
  }
  const dates = [...map.keys()].filter((d) => d <= today).sort();
  const start = dates.length ? dates[0] : today;
  return dateRange(start, today).map((date) => {
    const d = map.get(date) || { date };
    d.morning = morningScore(d);
    d.evening = eveningScore(d);
    d.symptom = symptomScore(d);
    d.pem = Boolean(d.checkin?.pem);
    return d;
  });
}

// Morning check-in (am_ fields) and end-of-day check-in, each 0–10.
export function morningScore(d) {
  if (!d.checkin) return null;
  return mean(SYMPTOMS.map((s) => (d.checkin[`am_${s.key}`] == null ? null : Number(d.checkin[`am_${s.key}`]))));
}
export function eveningScore(d) {
  if (!d.checkin) return null;
  return mean(SYMPTOMS.map((s) => (d.checkin[s.key] == null ? null : Number(d.checkin[s.key]))));
}

// Plain words for the 0–10 symptom average.
export function symptomWord(v) {
  if (v == null) return null;
  if (v < 0.5) return 'None';
  if (v < 2) return 'Very mild';
  if (v < 4) return 'Mild';
  if (v < 6) return 'Moderate';
  if (v < 8) return 'Bad';
  return 'Severe';
}

// Each symptom's 0–10 rating from one check-in ('am' or 'pm'), or null if none was logged.
export function symptomRatings(d, when) {
  if (!d?.checkin) return null;
  const out = {};
  let any = false;
  for (const s of SYMPTOMS) {
    const raw = d.checkin[when === 'am' ? `am_${s.key}` : s.key];
    out[s.key] = raw == null ? null : Number(raw);
    if (raw != null) any = true;
  }
  return any ? out : null;
}

// The day's score: the end-of-day check-in, or the morning one if that's all there is.
export function symptomScore(d) {
  const ev = eveningScore(d);
  if (ev != null) return ev;
  const am = morningScore(d);
  if (am != null) return am;
  if (d.quick?.length) {
    const e = mean(d.quick.map((q) => (q.energy == null ? null : Number(q.energy))));
    if (e != null) return 10 - e; // energy 10 = great  ->  symptom 0
  }
  return null;
}

// Median of the previous `window` days (not including day i).
function rollingBaseline(days, i, get, window = BASELINE_WINDOW, min = 5) {
  const vals = [];
  for (let k = Math.max(0, i - window); k < i; k++) {
    const v = get(days[k]);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  return vals.length >= min ? median(vals) : null;
}

function symptomBaselineAt(days, i) {
  const r = rollingBaseline(days, i, (d) => d.symptom, BASELINE_WINDOW, 5);
  if (r != null) return r;
  const first = days.slice(0, 21).map((d) => d.symptom);
  return nums(first).length >= 3 ? median(first) : null;
}

// ---------- crashes ----------
function isCrashDay(days, i, symBase) {
  const d = days[i];
  if (d.pem) return true;
  const b = symBase[i];
  return d.symptom != null && b != null && d.symptom - b >= 2.5 && d.symptom >= 5;
}

export function analyseCrashes(days, symBase) {
  const flags = days.map((_, i) => isCrashDay(days, i, symBase));
  const episodes = [];
  for (let i = 0; i < days.length; i++) {
    if (!flags[i]) continue;
    let end = i;
    while (end + 1 < days.length && (flags[end + 1] || (end + 2 < days.length && flags[end + 2]))) end++;
    while (!flags[end]) end--;
    const base = symBase[i] ?? 3;
    let peak = 0;
    for (let k = i; k <= end; k++) peak = Math.max(peak, days[k].symptom ?? 0);
    let recovered = null;
    for (let k = end + 1; k < days.length; k++) {
      if (days[k].symptom != null && days[k].symptom <= base + 1 && !flags[k]) { recovered = k; break; }
    }
    episodes.push({
      start: days[i].date,
      end: days[end].date,
      peak: round(peak, 0.1),
      baseline: round(base, 0.1),
      recoveryDays: recovered != null ? recovered - i : null,
      ongoing: recovered == null,
      daysSoFar: days.length - i,
      startIndex: i,
    });
    i = end;
  }

  const recoveries = episodes.filter((e) => !e.ongoing).map((e) => e.recoveryDays);
  const typicalRecovery = recoveries.length ? round(median(recoveries), 0.5) : null;

  // What tended to happen in the 3 days before each crash, compared with your normal.
  const precursors = [];
  if (episodes.length >= 1) {
    for (const f of FACTORS.filter((f) => f.precursor)) {
      const normal = median(days.map((d) => f.get(d)));
      if (normal == null || normal === 0) continue;
      const pre = [];
      for (const e of episodes) {
        const w = [];
        for (let k = Math.max(0, e.startIndex - 3); k < e.startIndex; k++) w.push(f.get(days[k]));
        const m = mean(w);
        if (m != null) pre.push(m);
      }
      if (!pre.length) continue;
      const avg = mean(pre);
      const pct = (avg - normal) / Math.abs(normal);
      const notable = f.lowerIsRisk ? pct <= -0.1 : pct >= 0.15;
      if (notable) precursors.push({ key: f.key, label: f.label, pct, text: f.precursorText(avg, normal, pct) });
    }
    precursors.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }

  return { flags, episodes: episodes.map(({ startIndex, ...e }) => e), typicalRecovery,
    recoveryRange: recoveries.length ? [Math.min(...recoveries), Math.max(...recoveries)] : null, precursors };
}

// ---------- factors ----------
const LEVELS = ['none', 'light', 'moderate', 'heavy'];
export const FACTORS = [
  { key: 'steps', label: 'Steps', group: 'Activity', lag: 1, precursor: true, get: (d) => d.steps ?? null,
    high: (t) => `higher-step days (over ${fmtInt(round(t, 100))})`,
    precursorText: (avg, normal, pct) => `Steps ${Math.round(pct * 100)}% above normal (${fmtInt(avg)} vs ${fmtInt(normal)})` },
  { key: 'exercise', label: 'Brisk movement', group: 'Activity', lag: 1, precursor: true, get: (d) => d.exercise ?? null,
    high: (t) => `days with more brisk movement (over ${Math.round(t)} min)`,
    precursorText: (avg, normal) => `More brisk movement than usual (${Math.round(avg)} vs ${Math.round(normal)} min)` },
  { key: 'hrAbove', label: 'Time above heart-rate ceiling', group: 'Activity', lag: 1, precursor: true, get: (d) => d.hr_above_min ?? null,
    high: (t) => `days with more time above your heart-rate ceiling (over ${Math.round(t)} min)`,
    precursorText: (avg, normal) => `More time above your heart-rate ceiling (${Math.round(avg)} vs ${Math.round(normal)} min)` },
  { key: 'energy', label: 'Physical effort', group: 'Activity', lag: 1, precursor: false, get: (d) => d.energy ?? null,
    high: () => 'days with more physical effort' },
  { key: 'screen', label: 'Screen time (total)', group: 'Daily load', lag: 1, precursor: true, get: (d) => screenHours(d).total,
    high: (t) => `heavier screen days (over ${round(t, 0.5)}h)`,
    precursorText: (avg, normal) => `More screen time (${round(avg, 0.5)}h vs ${round(normal, 0.5)}h)` },
  { key: 'phone', label: 'Phone screen time', group: 'Daily load', lag: 1, precursor: true, get: (d) => screenHours(d).phone,
    high: (t) => `days with more phone use (over ${round(t, 0.5)}h)`,
    precursorText: (avg, normal) => `More phone use (${round(avg, 0.5)}h vs ${round(normal, 0.5)}h)` },
  { key: 'laptop', label: 'Laptop / work time', group: 'Daily load', lag: 1, precursor: true, get: (d) => screenHours(d).laptop,
    high: (t) => `days with more laptop / work time (over ${round(t, 0.5)}h)`,
    precursorText: (avg, normal) => `More laptop / work time (${round(avg, 0.5)}h vs ${round(normal, 0.5)}h)` },
  { key: 'social', label: 'Social interaction', group: 'Daily load', lag: 1, precursor: true, categorical: true, get: (d) => d.checkin?.social ?? null,
    high: () => 'moderate or heavy social days',
    precursorText: (avg) => `Busier social days (average “${LEVELS[Math.round(avg)] || 'moderate'}”)` },
  { key: 'mental', label: 'Mental load', group: 'Daily load', lag: 1, precursor: true, categorical: true, get: (d) => d.checkin?.mental ?? null,
    high: () => 'high mental-load days',
    precursorText: () => 'Higher mental load' },
  { key: 'stress', label: 'Emotional stress', group: 'Daily load', lag: 1, precursor: true, categorical: true, get: (d) => d.checkin?.stress ?? null,
    high: () => 'more stressful days',
    precursorText: () => 'More emotional stress' },
  { key: 'rest', label: 'Rest breaks', group: 'Recovery habits', lag: 1, precursor: true, lowerIsRisk: true, categorical: true, get: (d) => d.checkin?.rests ?? null,
    high: () => 'days with 3 or more rest breaks',
    precursorText: () => 'Fewer rest breaks than usual' },
  { key: 'food', label: 'Healthy eating', group: 'Recovery habits', lag: 1, precursor: true, lowerIsRisk: true, get: (d) => d.checkin?.food ?? null,
    high: (t) => `days you rated your eating above ${round(t, 1)}/5`,
    precursorText: (avg, normal) => `Less healthy eating than usual (${round(avg, 0.5)}/5 vs ${round(normal, 0.5)})` },
  { key: 'nap', label: 'Daytime sleep', group: 'Recovery habits', lag: 1, precursor: false, get: (d) => d.nap_min ?? null,
    high: (t) => `days with more daytime sleep (over ${Math.round(t)} min)` },
  { key: 'sleep', label: 'Sleep', group: 'Body signals', lag: 0, precursor: true, lowerIsRisk: true, get: (d) => d.sleep_min ?? null,
    high: (t) => `nights with more sleep (over ${fmtMinutes(t)})`,
    precursorText: (avg, normal) => `Less sleep (${fmtMinutes(avg)} vs ${fmtMinutes(normal)})` },
  { key: 'bedtime', label: 'Bedtime', group: 'Body signals', lag: 0, precursor: true, get: (d) => d.bed_min ?? null,
    high: (t) => `nights you went to sleep later (after ${fmtClock(t)})`,
    precursorText: (avg, normal) => `Later bedtimes (${fmtClock(avg)} vs ${fmtClock(normal)})` },
  { key: 'wakeups', label: 'Night wake-ups', group: 'Body signals', lag: 0, precursor: true, get: (d) => d.wakeups ?? null,
    high: (t) => `more broken nights (over ${Math.round(t)} wake-ups)`,
    precursorText: (avg, normal) => `More broken sleep (${avg.toFixed(1)} vs ${normal.toFixed(1)} wake-ups)` },
  { key: 'hrv', label: 'HRV', group: 'Body signals', lag: 0, precursor: false, get: (d) => d.hrv ?? null,
    high: (t) => `higher-HRV days (over ${Math.round(t)} ms)` },
  { key: 'rhr', label: 'Resting heart rate', group: 'Body signals', lag: 0, precursor: false, get: (d) => d.rhr ?? null,
    high: (t) => `days with a higher resting heart rate (over ${Math.round(t)} bpm)` },
];

// `settled[i]` is true when day i started from your normal (not mid-crash or flared).
// Activity is judged only from settled days, otherwise rest forced by a crash
// would make low activity look like it causes symptoms.
export function analyseFactors(days, settled) {
  return FACTORS.map((f) => {
    const x = [], y = [];
    for (let i = 0; i < days.length; i++) {
      if (f.group !== 'Body signals' && settled && !settled[i]) continue;
      const v = f.get(days[i]);
      if (v == null || !Number.isFinite(v)) continue;
      const out = mean([days[i + f.lag]?.symptom, days[i + f.lag + 1]?.symptom]);
      if (out == null) continue;
      x.push(v); y.push(out);
    }
    const base = { key: f.key, label: f.label, group: f.group, n: x.length, lag: f.lag };
    if (x.length < 10) return { ...base, strength: 'insufficient', text: `Needs more days (${x.length} of 10).` };
    let threshold, hi, lo;
    if (f.categorical) {
      threshold = 2;
      hi = y.filter((_, i) => x[i] >= 2); lo = y.filter((_, i) => x[i] <= 1);
    } else {
      threshold = median(x);
      hi = y.filter((_, i) => x[i] > threshold); lo = y.filter((_, i) => x[i] <= threshold);
    }
    if (hi.length < 3 || lo.length < 3) {
      return { ...base, strength: 'insufficient', text: 'Not enough variety in your days yet to compare.' };
    }
    const diff = mean(hi) - mean(lo);
    const rho = spearman(x, y);
    let strength = 'emerging';
    if (Math.abs(diff) < 0.5 || Math.abs(rho) < 0.15) strength = 'none';
    else if (x.length >= 30 && Math.abs(rho) >= 0.3) strength = 'strong';
    const when = f.lag === 0 ? 'that day and the next' : 'over the next two days';
    const text = strength === 'none'
      ? `No clear link with your symptoms yet.`
      : `After ${f.high(threshold)}, symptoms ${when} were ${Math.abs(diff).toFixed(1)} points ${diff > 0 ? 'higher' : 'lower'}.`;
    return { ...base, strength, diff: round(diff, 0.1), rho: round(rho, 0.01), threshold, text, worsens: diff > 0 };
  }).sort((a, b) => {
    const order = { strong: 0, emerging: 1, none: 2, insufficient: 3 };
    return order[a.strength] - order[b.strength] || Math.abs(b.diff || 0) - Math.abs(a.diff || 0);
  });
}

// ---------- activity envelope ----------
function envelopeFor(days, symBase, crashFlags, settled, get) {
  const good = [], bad = [];
  for (let i = 0; i < days.length; i++) {
    if (!settled[i]) continue;
    const v = get(days[i]);
    if (v == null) continue;
    const next = [days[i + 1]?.symptom, days[i + 2]?.symptom];
    if (nums(next).length === 0) continue;
    const base = symBase[i] ?? symBase[i + 1];
    if (base == null) continue;
    const crashSoon = [1, 2, 3].some((k) => crashFlags[i + k]);
    const worse = crashSoon || Math.max(...nums(next)) - base >= 1.5;
    (worse ? bad : good).push(v);
  }
  const n = good.length + bad.length;
  if (n < MIN_DAYS_FOR_PATTERNS || good.length < 5) return { ready: false, n, needed: MIN_DAYS_FOR_PATTERNS };
  const safe = percentile(good, 0.6);
  let risky = bad.length >= 3 ? percentile(bad, 0.5) : null;
  if (risky != null && risky <= safe * 1.05) risky = null;
  return { ready: true, n, safe, risky, goodDays: good.length, badDays: bad.length };
}

// ---------- main ----------
export function analyse(data, today) {
  const days = buildDays(data, today);
  const t = days.length - 1;
  const symBase = days.map((_, i) => symptomBaselineAt(days, i));
  const crashes = analyseCrashes(days, symBase);

  const settled = days.map((d, i) => !crashes.flags[i] && !crashes.flags[i - 1]
    && (d.symptom == null || symBase[i] == null || d.symptom - symBase[i] < 1.5));
  const env = {
    steps: envelopeFor(days, symBase, crashes.flags, settled, (d) => d.steps ?? null),
    exercise: envelopeFor(days, symBase, crashes.flags, settled, (d) => d.exercise ?? null),
    screen: envelopeFor(days, symBase, crashes.flags, settled, (d) => screenHours(d).total),
  };
  if (env.screen.ready) { env.screen.safe = round(env.screen.safe, 0.25); env.screen.risky = round(env.screen.risky, 0.25); }
  if (env.steps.ready) { env.steps.safe = round(env.steps.safe, 100); env.steps.risky = round(env.steps.risky, 100); }
  if (env.exercise.ready) { env.exercise.safe = round(env.exercise.safe, 1); env.exercise.risky = round(env.exercise.risky, 1); }

  const last28 = days.slice(Math.max(0, t - BASELINE_WINDOW), t);
  const baseline = {
    rhr: median(last28.map((d) => d.rhr)),
    hrv: median(last28.map((d) => d.hrv)),
    sleep: median(last28.map((d) => d.sleep_min)),
    steps: median(last28.map((d) => d.steps)),
    exercise: median(last28.map((d) => d.exercise)),
    symptom: median(last28.map((d) => d.symptom)),
  };
  const withSym = last28.filter((d) => d.symptom != null);
  const stable = withSym.filter((d) => {
    const i = days.indexOf(d);
    return !crashes.flags[i] && symBase[i] != null && d.symptom <= symBase[i] + 1;
  });
  baseline.stablePct = withSym.length >= 7 ? stable.length / withSym.length : null;
  baseline.sustainableSteps = env.steps.ready ? env.steps.safe : null;

  const coverage = {
    days: days.length,
    watchDays: days.filter((d) => d.rhr != null || d.steps != null).length,
    checkinDays: days.filter((d) => d.symptom != null).length,
  };

  // Heart-rate ceiling: resting HR + 15 bpm (Workwell starting point — see research.js).
  baseline.hrCeiling = baseline.rhr != null ? Math.round(baseline.rhr + 15) : null;

  const status = todayStatus(days, t, symBase, crashes, env, baseline, coverage);
  const factors = analyseFactors(days, settled);
  const worked = analyseWhatWorked(days, symBase, crashes, settled, env, baseline, coverage);
  const redFlag = sustainedRhrRise(days, t);
  const trend = days.slice(-30).map((d, k, arr) => ({
    date: d.date, symptom: d.symptom, steps: d.steps ?? null,
    crash: crashes.flags[days.length - arr.length + k],
  }));

  return {
    today, days, symBase, crashes, envelope: env, baseline, coverage, status, factors, trend, worked, redFlag, events: data.hr_events || [], screenSessions: data.screen_sessions || [],
    statusText: statusToText(status, env, days[t]),
  };
}

function pick(days, t, key) {
  if (days[t]?.[key] != null) return { value: days[t][key], when: 'today' };
  if (days[t - 1]?.[key] != null) return { value: days[t - 1][key], when: 'yesterday' };
  return { value: null, when: null };
}

export function todayStatus(days, t, symBase, crashes, env, baseline, coverage) {
  if (coverage.watchDays < MIN_DAYS_FOR_STATUS) {
    return {
      level: 'building', title: 'Building your baseline',
      advice: `Progress needs about a week of watch data to know your normal. ${coverage.watchDays} of ${MIN_DAYS_FOR_STATUS} days so far — keep syncing and checking in.`,
      reasons: [], points: 0,
    };
  }
  const reasons = [];
  let points = 0;
  const add = (p, level, text) => { points += p; reasons.push({ level, text }); };

  const rhrBase = rollingBaseline(days, t, (d) => d.rhr);
  const rhr = pick(days, t, 'rhr');
  if (rhr.value != null && rhrBase != null) {
    const delta = rhr.value - rhrBase;
    if (delta >= 5) add(2, 'alert', `Resting heart rate ${Math.round(delta)} bpm above your normal`);
    else if (delta >= 3) add(1, 'warn', `Resting heart rate ${Math.round(delta)} bpm above your normal`);
    else reasons.push({ level: 'ok', text: 'Resting heart rate in your normal range' });
  }

  const hrvBase = rollingBaseline(days, t, (d) => d.hrv);
  const hrv = pick(days, t, 'hrv');
  if (hrv.value != null && hrvBase) {
    const pct = (hrv.value - hrvBase) / hrvBase;
    if (pct <= -0.2) add(2, 'alert', `HRV ${Math.round(-pct * 100)}% below your normal`);
    else if (pct <= -0.1) add(1, 'warn', `HRV ${Math.round(-pct * 100)}% below your normal`);
    else reasons.push({ level: 'ok', text: 'HRV in your normal range' });
  }

  const sleepBase = rollingBaseline(days, t, (d) => d.sleep_min);
  const sleep = days[t]?.sleep_min;
  if (sleep != null && sleepBase != null && sleep < sleepBase - 75) {
    add(1, 'warn', `Short night — ${fmtMinutes(sleep)} vs your usual ${fmtMinutes(sleepBase)}`);
  }

  // Post-exertional malaise usually lags 24–72h, so look back at the last three days.
  const envSteps = env.steps.ready ? env.steps.safe : baseline.steps;
  if (envSteps) {
    let worst = null;
    for (let k = 1; k <= 3; k++) {
      const s = days[t - k]?.steps;
      if (s == null) continue;
      const ratio = s / envSteps;
      if (!worst || ratio > worst.ratio) worst = { ratio, k, s };
    }
    if (worst && worst.ratio > 1.3) {
      const when = worst.k === 1 ? 'Yesterday' : `${worst.k} days ago`;
      add(2, 'alert', `${when} you did ${fmtInt(worst.s)} steps — ${Math.round((worst.ratio - 1) * 100)}% over your envelope. Crashes can lag 1–3 days.`);
    } else if (worst && worst.ratio > 1.15) {
      const when = worst.k === 1 ? 'Yesterday' : `${worst.k} days ago`;
      add(1, 'warn', `${when} was a busier day (${fmtInt(worst.s)} steps)`);
    }
    const todaySteps = days[t]?.steps;
    if (todaySteps != null && todaySteps > envSteps) add(1, 'warn', `You've already passed today's step envelope`);
  }

  const latestSym = days[t]?.symptom != null ? { v: days[t].symptom, i: t } : days[t - 1]?.symptom != null ? { v: days[t - 1].symptom, i: t - 1 } : null;
  if (latestSym && symBase[latestSym.i] != null) {
    const d = latestSym.v - symBase[latestSym.i];
    if (d >= 2) add(2, 'alert', `Symptoms ${d.toFixed(1)} points above your baseline`);
    else if (d >= 1) add(1, 'warn', `Symptoms a little above your baseline`);
  }

  const ongoing = crashes.episodes.find((e) => e.ongoing);
  if (ongoing || crashes.flags[t] || crashes.flags[t - 1]) add(3, 'alert', ongoing ? `In a crash — day ${ongoing.daysSoFar}` : 'Crash logged in the last two days');

  let level, title, advice;
  const rec = crashes.typicalRecovery;
  if (points >= 4) {
    level = 'red'; title = 'Rest and recover';
    advice = `Keep today as low-demand as you can: short bursts of only what’s essential, with rest between, and minimal screens.${rec ? ` Your crashes have usually taken about ${rec} days to settle.` : ''}`;
  } else if (points >= 2) {
    level = 'amber'; title = 'Ease off today';
    advice = 'Plan a lighter day — roughly two-thirds of your usual activity, rest before you feel tired, and break up screen time.';
  } else {
    level = 'green'; title = 'Within your envelope';
    advice = 'A steady day. Stay around your usual level and stop before you feel the need to.';
  }
  return { level, title, advice, reasons, points };
}

function statusToText(status, env, today) {
  const lines = [status.title];
  const top = status.reasons.filter((r) => r.level !== 'ok').slice(0, 2);
  for (const r of top) lines.push('• ' + r.text);
  if (env.steps.ready) {
    const so = today?.steps != null ? ` (${fmtInt(today.steps)} so far)` : '';
    lines.push(`Envelope: ~${fmtInt(env.steps.safe)} steps${so}`);
  }
  return lines.join('\n');
}

// ---------- what has worked for you ----------
// Finds past days that looked like today does when you're at risk (amber/red from a settled
// start), then compares what you did next on the occasions you avoided a crash vs when you didn't.
const RESPONSE_METRICS = [
  { key: 'steps', label: 'steps', get: (d) => d.steps ?? null, lowerBetter: true, min: (a, b) => Math.abs(a - b) / Math.max(a, b) >= 0.15,
    say: (good, bad) => `kept to about ${fmtInt(round(good, 100))} steps a day${bad != null ? ` (vs ${fmtInt(round(bad, 100))} when you crashed)` : ''}` },
  { key: 'exercise', label: 'brisk movement', get: (d) => d.exercise ?? null, lowerBetter: true, min: (a, b) => Math.abs(a - b) >= 5,
    say: (good, bad) => `kept brisk movement to ~${Math.round(good)} min${bad != null ? ` (vs ${Math.round(bad)})` : ''}` },
  { key: 'rest', label: 'rest breaks', get: (d) => d.checkin?.rests ?? null, lowerBetter: false, min: (a, b) => Math.abs(a - b) >= 0.5,
    say: (good) => `took more rest breaks (around ${['none', '1–2', '3–4', '5+'][Math.round(good)]} a day)` },
  { key: 'laptop', label: 'laptop', get: (d) => screenHours(d).laptop, lowerBetter: true, min: (a, b) => Math.abs(a - b) >= 0.75,
    say: (good, bad) => `kept laptop / work time to ~${round(good, 0.5)}h${bad != null ? ` (vs ${round(bad, 0.5)}h)` : ''}` },
  { key: 'screen', label: 'screens', get: (d) => screenHours(d).total, lowerBetter: true, min: (a, b) => Math.abs(a - b) >= 0.75,
    say: (good, bad) => `cut screens to ~${round(good, 0.5)}h${bad != null ? ` (vs ${round(bad, 0.5)}h)` : ''}` },
  { key: 'social', label: 'social', get: (d) => d.checkin?.social ?? null, lowerBetter: true, min: (a, b) => Math.abs(a - b) >= 0.5,
    say: () => 'kept social contact light' },
  { key: 'mental', label: 'mental load', get: (d) => d.checkin?.mental ?? null, lowerBetter: true, min: (a, b) => Math.abs(a - b) >= 0.5,
    say: () => 'lowered mental load (less work and planning)' },
  { key: 'sleep', label: 'sleep', get: (d) => d.sleep_min ?? null, lowerBetter: false, offset: 1, min: (a, b) => Math.abs(a - b) >= 20,
    say: (good, bad) => `slept ~${fmtMinutes(good)}${bad != null ? ` (vs ${fmtMinutes(bad)})` : ''}` },
  { key: 'hrAbove', label: 'time above ceiling', get: (d) => d.hr_above_min ?? null, lowerBetter: true, min: (a, b) => Math.abs(a - b) >= 10,
    say: (good, bad) => `kept time above your heart-rate ceiling to ~${Math.round(good)} min${bad != null ? ` (vs ${Math.round(bad)})` : ''}` },
  { key: 'food', label: 'eating', get: (d) => d.checkin?.food ?? null, lowerBetter: false, min: (a, b) => Math.abs(a - b) >= 0.5,
    say: (good, bad) => `ate well (~${round(good, 0.5)}/5${bad != null ? ` vs ${round(bad, 0.5)}` : ''})` },
  { key: 'nap', label: 'naps', get: (d) => d.nap_min ?? 0, lowerBetter: false, min: (a, b) => Math.abs(a - b) >= 15,
    say: (good) => `rested or napped in the day (~${Math.round(good)} min)` },
];

function windowMean(days, i, m, len = 2) {
  const off = m.offset || 0;
  const vals = [];
  for (let k = 0; k < len; k++) vals.push(m.get(days[i + off + k] || {}));
  return mean(vals);
}

export function analyseWhatWorked(days, symBase, crashes, settled, env, baseline, coverage) {
  const t = days.length - 1;
  const noCrash = { flags: days.map(() => false), episodes: [], typicalRecovery: null };
  const events = [];
  let lastEvent = -10;
  for (let i = MIN_DAYS_FOR_STATUS; i < t; i++) {
    if (!settled[i] || i - lastEvent < 4) continue;
    const st = todayStatus(days.slice(0, i + 1), i, symBase, noCrash, env, baseline, coverage);
    if (st.points < 2) continue;
    const crashed = [1, 2, 3, 4].some((k) => crashes.flags[i + k]);
    if (!crashed && i + 4 > t) continue; // too recent to know the outcome
    events.push({ i, date: days[i].date, crashed, level: st.points >= 4 ? 'red' : 'amber' });
    lastEvent = i;
  }

  const avoided = events.filter((e) => !e.crashed);
  const crashedEv = events.filter((e) => e.crashed);
  const tips = [];
  if (avoided.length >= 2) {
    for (const m of RESPONSE_METRICS) {
      const g = mean(avoided.map((e) => windowMean(days, e.i, m)));
      if (g == null) continue;
      const b = crashedEv.length >= 2 ? mean(crashedEv.map((e) => windowMean(days, e.i, m))) : null;
      if (b != null) {
        const better = m.lowerBetter ? g < b : g > b;
        if (!better || !m.min(g, b)) continue;
        tips.push({ key: m.key, text: m.say(g, b), weight: Math.abs(g - b) / (Math.abs(b) || 1) });
      } else if (m.key === 'steps' || m.key === 'screen' || m.key === 'sleep') {
        tips.push({ key: m.key, text: m.say(g, null), weight: 0 });
      }
    }
    tips.sort((x, y) => y.weight - x.weight);
  }

  // Recovery: what the first three days of your quicker recoveries had in common.
  const recoveryTips = [];
  const done = crashes.episodes.filter((e) => !e.ongoing);
  if (done.length >= 4) {
    const cut = median(done.map((e) => e.recoveryDays));
    const idx = (e) => days.findIndex((d) => d.date === e.start);
    const quick = done.filter((e) => e.recoveryDays <= cut), slow = done.filter((e) => e.recoveryDays > cut);
    if (quick.length >= 2 && slow.length >= 2) {
      for (const m of RESPONSE_METRICS) {
        const g = mean(quick.map((e) => windowMean(days, idx(e), m, 3)));
        const b = mean(slow.map((e) => windowMean(days, idx(e), m, 3)));
        if (g == null || b == null) continue;
        const better = m.lowerBetter ? g < b : g > b;
        if (better && m.min(g, b)) recoveryTips.push({ key: m.key, text: m.say(g, b).replace(/when you crashed/, 'in slower recoveries'), weight: Math.abs(g - b) / (Math.abs(b) || 1) });
      }
      recoveryTips.sort((x, y) => y.weight - x.weight);
    }
  }
  const quickDays = done.length >= 4 ? round(mean(done.filter((e) => e.recoveryDays <= median(done.map((x) => x.recoveryDays))).map((e) => e.recoveryDays)), 0.5) : null;

  return {
    events: events.length,
    avoided: avoided.length,
    crashed: crashedEv.length,
    ready: avoided.length >= 2,
    tips: tips.slice(0, 4).map(({ key, text }) => ({ key, text: text.charAt(0).toUpperCase() + text.slice(1) })),
    recovery: { ready: recoveryTips.length > 0, quickDays, tips: recoveryTips.slice(0, 3).map(({ key, text }) => ({ key, text: text.charAt(0).toUpperCase() + text.slice(1) })) },
  };
}

// Red-flag check: resting HR 10+ bpm above normal for 3 days running.
function sustainedRhrRise(days, t) {
  let run = 0;
  for (let k = 0; k < 3; k++) {
    const i = t - k;
    const base = rollingBaseline(days, i - 3, (d) => d.rhr);
    const v = days[i]?.rhr;
    if (v != null && base != null && v - base >= 10) run++;
  }
  return run === 3 ? 'Your resting heart rate has been 10+ bpm above normal for three days. If this continues or you feel unwell, it’s worth checking in with your GP.' : null;
}
