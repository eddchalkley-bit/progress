// Sleep coach — learns what sleep YOU need and how each night changes the next day.
// Pure functions on top of analyse(). Night on date D = the sleep you woke up from on D,
// so its effect is read from day D (symptoms) and D..D+1 (crashes).
import { median, mean, percentile } from './analysis.js';
import { fmtMinutes, fmtClock } from './time.js';

export const SLEEP = {
  defaultNeed: 480,      // NHS 7–9h: 8h until your own need is learned
  minNeed: 420, maxNeed: 600,
  minGoodNights: 8,      // good-day nights needed before the need is "learned"
  minGroup: 5,           // nights per side before comparing (insights)
  latency: 15,           // minutes to fall asleep, used for the bedtime target
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round15 = (m) => Math.round(m / 15) * 15;
const total = (d) => (d.sleep_min == null ? null : d.sleep_min + (d.nap_min || 0));

// Was this a good / hard day to wake into?  (null = not enough info)
function outcome(a, i) {
  const d = a.days[i], base = a.symBase[i], flags = a.crashes.flags;
  if (flags[i] || flags[i + 1]) return 'bad';
  if (d.symptom == null || base == null) return null;
  if (d.symptom <= base + 0.25) return 'good';
  if (d.symptom >= base + 1) return 'bad';
  return null;
}

function compare(a, idx, isHigh, label) {
  const hi = idx.filter(isHigh), lo = idx.filter((i) => !isHigh(i));
  const sym = (set) => mean(set.map((i) => a.days[i].symptom - (a.symBase[i] ?? a.days[i].symptom)).filter((v) => Number.isFinite(v)));
  const crashRate = (set) => set.filter((i) => a.crashes.flags[i] || a.crashes.flags[i + 1]).length / (set.length || 1);
  if (hi.length < SLEEP.minGroup || lo.length < SLEEP.minGroup) return null;
  const sh = sym(hi.filter((i) => a.days[i].symptom != null)), sl = sym(lo.filter((i) => a.days[i].symptom != null));
  return { label, nHi: hi.length, nLo: lo.length, symHi: sh, symLo: sl, diff: sh != null && sl != null ? sl - sh : null, crashHi: crashRate(hi), crashLo: crashRate(lo) };
}

export function analyseSleep(a) {
  const days = a.days, t = days.length - 1;
  const from = Math.max(0, t - 90);
  const nights = [];
  for (let i = from; i <= t; i++) if (days[i].sleep_min != null) nights.push(i);
  const recent = (n) => nights.filter((i) => i > t - n && i < t);

  // ---- 1. Your sleep need: the typical sleep before your good days ----
  const good = nights.filter((i) => i < t && outcome(a, i) === 'good');
  const learned = good.length >= SLEEP.minGoodNights;
  // Upper-middle of your good nights, so a habit of short sleep doesn't drag the target down.
  const need = learned ? clamp(round15(percentile(good.map(total), 0.6)), SLEEP.minNeed, SLEEP.maxNeed) : SLEEP.defaultNeed;

  // ---- 2. Rhythm: usual bedtime / wake time, and how regular they are ----
  const last28 = recent(29);
  const usualBed = median(last28.map((i) => days[i].bed_min));
  const usualWake = median(last28.map((i) => days[i].wake_min));
  const last14 = recent(15).map((i) => days[i].bed_min).filter((v) => v != null);
  const bedSpread = last14.length >= 5 && usualBed != null ? median(last14.map((v) => Math.abs(v - usualBed))) : null;
  const targetBed = usualWake != null ? round15(usualWake - need - SLEEP.latency) : null;

  // ---- 3. Interruptions baseline ----
  const usualAwake = median(last28.map((i) => days[i].awake_min));
  const usualWakeups = median(last28.map((i) => days[i].wakeups));

  // ---- 4. Sleep debt over the last 7 nights (naps count towards paying it back) ----
  const week = [];
  for (let i = t - 6; i <= t; i++) if (i >= 0) week.push(days[i]);
  const weekTotals = week.map(total).filter((v) => v != null);
  const debt = weekTotals.length >= 3 ? Math.max(0, weekTotals.reduce((s, v) => s + (need - v), 0)) : null;

  // ---- 5. Last night ----
  const n = days[t];
  const has = n.sleep_min != null;
  let score = null, parts = null;
  if (has) {
    const ratio = n.sleep_min / need;
    const duration = 50 * clamp((ratio - 0.6) / 0.4, 0, 1);
    let timing = null;
    const ref = targetBed ?? usualBed;
    if (n.bed_min != null && ref != null) {
      const late = n.bed_min - ref;                  // + = later than ideal
      timing = late > 30 ? 30 - (late - 30) / 4 : late < -90 ? 30 - (-late - 90) / 10 : 30;
      timing = clamp(timing, 0, 30);
    }
    let calm = null;
    if (n.awake_min != null || n.wakeups != null) {
      calm = 20 - Math.max(0, (n.awake_min ?? 0) - 15) * 0.4 - Math.max(0, (n.wakeups ?? 0) - 2) * 2;
      calm = clamp(calm, 0, 20);
    }
    const got = duration + (timing ?? 0) + (calm ?? 0);
    const max = 50 + (timing != null ? 30 : 0) + (calm != null ? 20 : 0);
    score = Math.round((got / max) * 100);
    parts = { duration: Math.round(duration), timing: timing == null ? null : Math.round(timing), calm: calm == null ? null : Math.round(calm) };
  }

  // Overnight body recovery: HRV and resting HR against your normal.
  const b = a.baseline;
  const hrvPct = n.hrv != null && b.hrv ? (n.hrv - b.hrv) / b.hrv : null;
  const rhrDelta = n.rhr != null && b.rhr != null ? n.rhr - b.rhr : null;
  let body = null;
  if (hrvPct != null || rhrDelta != null) {
    const strain = (hrvPct != null && hrvPct <= -0.1 ? 1 : 0) + (hrvPct != null && hrvPct <= -0.2 ? 1 : 0)
      + (rhrDelta != null && rhrDelta >= 3 ? 1 : 0) + (rhrDelta != null && rhrDelta >= 5 ? 1 : 0);
    body = strain === 0 ? 'recovered' : strain <= 1 ? 'partly' : 'strained';
  }

  // ---- 6. Today's energy potential from last night (×your normal) ----
  let potential = 1;
  if (score != null) potential = 1 + (score - 75) / 250;
  if (debt != null && debt > 120) potential -= ((debt - 120) / 60) * 0.02;
  if (body === 'partly') potential -= 0.04;
  if (body === 'strained') potential -= 0.1;
  potential = clamp(Math.round(potential * 100) / 100, 0.7, 1.1);

  // ---- 7. What sleep does for YOU (needs enough nights on both sides) ----
  const judged = nights.filter((i) => i < t && (days[i].symptom != null || a.crashes.flags[i] || a.crashes.flags[i + 1]));
  const effects = [];
  const dur = compare(a, judged, (i) => total(days[i]) >= need - 15, 'duration');
  if (dur) effects.push({ ...dur, text: dur.diff != null && dur.diff > 0.2
    ? `After nights of ${fmtMinutes(need)}+ your symptoms run ${dur.diff.toFixed(1)} points lower than after shorter nights.`
    : `Sleep length hasn’t made a clear difference to how you feel the next day so far.` });
  if (targetBed != null) {
    const withBed = judged.filter((i) => days[i].bed_min != null);
    const bed = compare(a, withBed, (i) => days[i].bed_min <= targetBed + 30, 'bedtime');
    if (bed) effects.push({ ...bed, text: bed.diff != null && bed.diff > 0.2
      ? `When you’re asleep by ${fmtClock(targetBed + 30)}, the next day is ${bed.diff.toFixed(1)} points better.`
      : `Bedtime hasn’t made a clear difference yet.` });
  }
  const withWake = judged.filter((i) => days[i].wakeups != null);
  const wk = compare(a, withWake, (i) => days[i].wakeups <= 1, 'interruptions');
  if (wk) effects.push({ ...wk, text: wk.diff != null && wk.diff > 0.2
    ? `Unbroken nights (0–1 wake-ups) are followed by days ${wk.diff.toFixed(1)} points better.`
    : `Waking in the night hasn’t made a clear difference yet.` });
  const shortCrash = dur && dur.crashLo > dur.crashHi + 0.08
    ? `Crashes followed ${Math.round(dur.crashLo * 100)}% of your short nights vs ${Math.round(dur.crashHi * 100)}% of full ones.` : null;
  effects.sort((x, y) => (y.diff ?? 0) - (x.diff ?? 0));
  const confidence = judged.length >= 30 ? 'Consistent pattern' : 'Early pattern';

  // ---- 8. Coaching for today / tonight ----
  const coach = [];
  if (!has) coach.push('No sleep data for last night yet — run Progress Sync after you wake.');
  else {
    const gap = n.sleep_min - need;
    if (score >= 85 && body !== 'strained')
      coach.push(`Strong night. Today’s potential is up ${Math.round((potential - 1) * 100)}%. Bank it rather than spend it: staying inside your budget is what builds your baseline.`);
    else if (gap < -60)
      coach.push(`${fmtMinutes(-gap)} short of your need. Plan a 20–30 minute lie-down after lunch, eyes closed, even if you don’t sleep.`);
    if (body === 'strained') coach.push('Your body is still under strain overnight (HRV / resting HR off your normal). Treat today as a lighter day even if you feel fine.');
    if (debt != null && debt >= 120) coach.push(`You’re carrying ${fmtMinutes(debt)} of sleep debt this week. Earlier nights pay it back faster than lie-ins, which shift your rhythm.`);
    if (n.wakeups != null && usualWakeups != null && n.wakeups >= usualWakeups + 2) coach.push(`More broken than usual (${n.wakeups} wake-ups vs your usual ${Math.round(usualWakeups)}). Look at what was different yesterday evening: screens, a late meal or a busy day.`);
  }
  if (targetBed != null) {
    coach.push(`Tonight: in bed by ${fmtClock(targetBed)} to get your ${fmtMinutes(need)} before your usual ${fmtClock(usualWake)} wake-up.`);
  }

  // Last 7 nights for the chart
  const series = [];
  for (let i = t - 6; i <= t; i++) {
    const d = days[i];
    if (!d) continue;
    series.push({ date: d.date, sleep: d.sleep_min ?? null, nap: d.nap_min ?? 0, bed: d.bed_min ?? null, outcome: i < t ? outcome(a, i) : null });
  }

  return {
    need, learned, goodNights: good.length, nightsNeeded: Math.max(0, SLEEP.minGoodNights - good.length),
    usualBed, usualWake, bedSpread, targetBed, usualAwake, usualWakeups,
    debt, score, parts, body, hrvPct, rhrDelta, potential,
    last: has ? { sleep: n.sleep_min, nap: n.nap_min ?? 0, bed: n.bed_min ?? null, wake: n.wake_min ?? null, awake: n.awake_min ?? null, wakeups: n.wakeups ?? null, deep: n.deep_min ?? null, rem: n.rem_min ?? null } : null,
    usualDeep: median(last28.map((i) => days[i].deep_min)), usualRem: median(last28.map((i) => days[i].rem_min)),
    effects, shortCrash, confidence, judgedNights: judged.length, coach, series,
  };
}

export function scoreWord(s) {
  if (s == null) return '–';
  return s >= 85 ? 'Restorative' : s >= 70 ? 'Good' : s >= 50 ? 'Fair' : 'Poor';
}
