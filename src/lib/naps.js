// Nap coach — picks up daytime sleep from Apple Health and works out what it does for YOU.
// Pure functions on top of analyse(); no extra tables or shortcuts. Detection lives in ingest.js
// (nap_min / nap_count / nap_start_min / nap_end_min per day, filed under the day the nap started).
//
// Two jobs:
//   1. Today: what the nap does to today's energy and to tonight's sleep.
//   2. Over time: how the days after your naps actually go (next night, next day, crashes),
//      split by nap length and time of day once there is enough history.
//
// Naps usually happen on harder days, so every comparison is "the day AFTER a nap" and, where there is
// enough data, "after a short night: nap vs no nap". Patterns, not proof of cause.
import { median, mean } from './analysis.js';
import { fmtMinutes, fmtClock } from './time.js';

export const NAPS = {
  minMin: 10,            // minutes asleep for a day to count as a nap day
  longMin: 60,           // a nap over this can make dropping off harder
  lateEnd: 16 * 60,      // a nap ending after 16:00
  minGroup: 5,           // days per side before comparing
  minDaysLearned: 8,     // nap days before the effects are called a pattern
  window: 120,           // days of history to learn from
  maxShare: 0.75,        // most of a poor night's shortfall a nap can win back
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const hadNap = (d) => d != null && (d.nap_min ?? 0) >= NAPS.minMin;

export function napOfDay(d) {
  if (!hadNap(d)) return null;
  const min = Math.round(d.nap_min);
  const start = d.nap_start_min ?? null, end = d.nap_end_min ?? null;
  return {
    min, count: d.nap_count ?? 1, start, end,
    long: min > NAPS.longMin,
    late: end != null && end > NAPS.lateEnd,
  };
}

const diffMean = (xs, ys) => (xs.length && ys.length ? mean(xs) - mean(ys) : null);
const diffMedian = (xs, ys) => (xs.length && ys.length ? median(xs) - median(ys) : null);
const finite = (v) => v != null && Number.isFinite(v);

// Next-day outcomes for a set of day indices.
function nextDay(a, idx) {
  const days = a.days, flags = a.crashes.flags;
  const sym = idx.map((i) => (days[i + 1]?.symptom != null && a.symBase[i + 1] != null ? days[i + 1].symptom - a.symBase[i + 1] : null)).filter(finite);
  const crash = idx.length ? idx.filter((i) => flags[i + 1] || flags[i + 2]).length / idx.length : null;
  const bed = idx.map((i) => days[i + 1]?.bed_min).filter(finite);
  const sleep = idx.map((i) => days[i + 1]?.sleep_min).filter(finite);
  const wake = idx.map((i) => days[i + 1]?.wakeups).filter(finite);
  return { n: idx.length, sym, crash, bed, sleep, wake };
}

// How the day after a nap goes versus the day after no nap.
function contrast(a, napIdx, noIdx) {
  const N = nextDay(a, napIdx), O = nextDay(a, noIdx);
  return {
    nNap: napIdx.length, nNo: noIdx.length,
    sym: N.sym.length >= 3 && O.sym.length >= 3 ? diffMean(N.sym, O.sym) : null,   // + = worse after a nap
    crashNap: N.crash, crashNo: O.crash,
    bed: N.bed.length >= 3 && O.bed.length >= 3 ? diffMedian(N.bed, O.bed) : null,  // + = later
    sleep: N.sleep.length >= 3 && O.sleep.length >= 3 ? diffMean(N.sleep, O.sleep) : null,
    wake: N.wake.length >= 3 && O.wake.length >= 3 ? diffMean(N.wake, O.wake) : null,
    bedNap: N.bed.length >= 3 ? median(N.bed) : null, bedNo: O.bed.length >= 3 ? median(O.bed) : null,
  };
}

/**
 * a:   result of analyse()
 * ctx: { need, usualBed, targetBed, potential }  — from analyseSleep (night only)
 */
export function analyseNaps(a, ctx = {}) {
  const days = a.days, t = days.length - 1;
  const from = Math.max(0, t - NAPS.window);
  const k = NAPS;

  // History: days (before today) where we can see what followed.
  const napIdx = [], noIdx = [];
  for (let i = from; i < t; i++) {
    const d = days[i];
    if (d.sleep_min == null && d.rhr == null && d.steps == null && d.symptom == null) continue; // no data that day
    (hadNap(d) ? napIdx : noIdx).push(i);
  }
  const napDays = napIdx.length;
  const recentNaps = napIdx.filter((i) => i > t - 29);
  const usual = {
    perWeek: Math.round((recentNaps.length / 4) * 10) / 10,
    min: median(napIdx.map((i) => days[i].nap_min)),
    start: median(napIdx.map((i) => days[i].nap_start_min).filter(finite)),
  };

  // ---- Effects (only with enough days on both sides) ----
  const enough = napIdx.length >= k.minGroup && noIdx.length >= k.minGroup;
  const all = enough ? contrast(a, napIdx, noIdx) : null;

  // After a short night: did napping make the next day better or worse?
  const need = ctx.need ?? 480;
  const short = (i) => days[i].sleep_min != null && days[i].sleep_min < need - 30;
  const sNap = napIdx.filter(short), sNo = noIdx.filter(short);
  const afterShort = sNap.length >= k.minGroup && sNo.length >= k.minGroup ? contrast(a, sNap, sNo) : null;

  // Which kinds of nap cost you sleep? (length, then time of day)
  const lenLong = napIdx.filter((i) => days[i].nap_min > k.longMin), lenShort = napIdx.filter((i) => days[i].nap_min <= k.longMin);
  const byLength = lenLong.length >= k.minGroup && lenShort.length >= k.minGroup ? contrast(a, lenLong, lenShort) : null;
  const withEnd = napIdx.filter((i) => days[i].nap_end_min != null);
  const lateIdx = withEnd.filter((i) => days[i].nap_end_min > k.lateEnd), earlyIdx = withEnd.filter((i) => days[i].nap_end_min <= k.lateEnd);
  const byTime = lateIdx.length >= k.minGroup && earlyIdx.length >= k.minGroup ? contrast(a, lateIdx, earlyIdx) : null;

  const effects = [];
  if (all) {
    if (all.bed != null) {
      effects.push({ key: 'bed', diff: all.bed, text: Math.abs(all.bed) >= 20
        ? `On nights after a nap you go to bed about ${fmtMinutes(Math.abs(all.bed))} ${all.bed > 0 ? 'later' : 'earlier'} (${fmtClock(all.bedNap)} vs ${fmtClock(all.bedNo)}).`
        : 'Your naps haven’t shifted your bedtime.' });
    }
    if (all.sleep != null && Math.abs(all.sleep) >= 30) {
      effects.push({ key: 'sleep', diff: all.sleep, text: `The night after a nap you sleep ${fmtMinutes(Math.abs(all.sleep))} ${all.sleep < 0 ? 'less' : 'more'} than after a day without one.` });
    }
    if (all.wake != null && all.wake >= 1) {
      effects.push({ key: 'wake', diff: all.wake, text: `More broken sleep after a nap day (${all.wake.toFixed(1)} extra wake-ups on average).` });
    }
    if (all.sym != null) {
      effects.push({ key: 'sym', diff: all.sym, text: all.sym <= -0.3
        ? `The day after a nap your symptoms run ${Math.abs(all.sym).toFixed(1)} points lower than your normal.`
        : all.sym >= 0.3
          ? `The day after a nap your symptoms run ${all.sym.toFixed(1)} points higher. Naps tend to land on harder days, so this may be the hard day rather than the nap.`
          : 'Napping hasn’t made a clear difference to how you feel the next day.' });
    }
    if (all.crashNap != null && all.crashNo != null && Math.abs(all.crashNap - all.crashNo) >= 0.1) {
      effects.push({ key: 'crash', diff: all.crashNo - all.crashNap, text: all.crashNap < all.crashNo
        ? `A crash followed ${Math.round(all.crashNap * 100)}% of nap days vs ${Math.round(all.crashNo * 100)}% of days without one.`
        : `A crash followed ${Math.round(all.crashNap * 100)}% of nap days vs ${Math.round(all.crashNo * 100)}% of days without one — more often when you needed the rest most.` });
    }
  }
  if (afterShort && afterShort.sym != null) {
    effects.push({ key: 'short', diff: afterShort.sym, text: afterShort.sym <= -0.3
      ? `After a short night, napping goes with a better next day (${Math.abs(afterShort.sym).toFixed(1)} points lower symptoms than not napping).`
      : afterShort.sym >= 0.3
        ? `After a short night, days with a nap were followed by worse days (${afterShort.sym.toFixed(1)} points higher) than days without.`
        : 'After a short night, napping hasn’t changed how the next day goes.' });
  }
  if (byLength && byLength.bed != null && byLength.bed >= 20) {
    effects.push({ key: 'length', diff: byLength.bed, text: `Naps over ${fmtMinutes(k.longMin)} push your bedtime about ${fmtMinutes(byLength.bed)} later than shorter ones.` });
  }
  if (byTime && byTime.bed != null && byTime.bed >= 20) {
    effects.push({ key: 'time', diff: byTime.bed, text: `Naps ending after ${fmtClock(k.lateEnd)} push your bedtime about ${fmtMinutes(byTime.bed)} later than earlier ones.` });
  }

  // ---- Verdict: does napping help you? (drives how much of a poor night a nap recovers) ----
  // The controlled comparison (after a short night) beats the raw one, because naps land on harder days.
  const sleepCost = Boolean(all && all.bed != null && all.sleep != null && all.bed >= 30 && all.sleep <= -30);
  let verdict = null;
  if (all) {
    const sym = afterShort?.sym ?? all.sym;
    if (sym != null && sym <= -0.3) verdict = sleepCost ? 'mixed' : 'helps';   // better days, but at a cost to the night
    else if (afterShort?.sym != null && afterShort.sym >= 0.3) verdict = 'hurts';
    else if (sleepCost) verdict = 'hurts';
    else verdict = sym == null ? null : 'neutral';
  }
  const learned = napDays >= k.minDaysLearned && enough;
  const confidence = napDays >= 20 ? 'Consistent pattern' : 'Early pattern';

  // ---- Today ----
  const today = napOfDay(days[t]);
  const yesterday = napOfDay(days[t - 1]);
  const usualBed = ctx.usualBed ?? null;

  // Typical bedtime shift after YOUR naps (only when learned and the effect is real).
  const learnedShift = all && all.bed != null && Math.abs(all.bed) >= 20 ? all.bed : null;
  let tonight = null;
  if (today) {
    const aim = ctx.targetBed ?? usualBed;
    const aimTxt = aim != null ? ` (${fmtClock(aim)})` : '';
    if (learnedShift != null && learnedShift > 0) {
      tonight = { level: 'watch', text: `Your naps usually push bedtime about ${fmtMinutes(learnedShift)} later. Keep your usual bedtime${aimTxt} — wind down on time rather than waiting to feel sleepy.` };
    } else if (today.long || today.late) {
      const why = today.long && today.late ? 'long and late' : today.long ? `over ${fmtMinutes(k.longMin)}` : `ending after ${fmtClock(k.lateEnd)}`;
      tonight = { level: 'watch', text: `A nap ${why} can make it harder to drop off tonight. Keep your usual bedtime${aimTxt} and dim the lights early.` };
    } else {
      tonight = { level: 'low', text: 'A nap this size rarely disturbs the night. Keep your usual bedtime.' };
    }
  }

  // How much of a poor night's shortfall today's nap wins back.
  const share = napRestoreShare(today, verdict);

  // Coaching lines for today.
  const coach = [];
  if (today) {
    const span = today.start != null && today.end != null ? ` (${fmtClock(today.start)}–${fmtClock(today.end)})` : '';
    coach.push(`${today.count > 1 ? `${today.count} naps, ${fmtMinutes(today.min)} in total` : `A ${fmtMinutes(today.min)} nap`}${span} picked up from Apple Health.`);
  }
  if (!today && yesterday && days[t].bed_min != null && usualBed != null) {
    const late = days[t].bed_min - usualBed;
    if (late >= 30) coach.push(`Yesterday’s ${fmtMinutes(yesterday.min)} nap${yesterday.end != null ? ` (ended ${fmtClock(yesterday.end)})` : ''} was followed by a bedtime ${fmtMinutes(late)} later than usual. If it keeps happening, try a shorter or earlier nap.`);
  }

  return {
    today, yesterday, tonight, share, verdict, learned, confidence,
    napDays, usual, effects, coach,
    counts: { nap: napIdx.length, none: noIdx.length, afterShortNap: sNap.length, afterShortNone: sNo.length },
  };
}

// Share (0–0.75) of a poor night's shortfall that a nap wins back. Never lifts you above normal —
// the budget deliberately doesn't rise past your usual (banking is how a baseline grows).
//   default:        up to half the shortfall for a nap of about 90 minutes, scaling down for shorter ones
//   your data says naps help:  ×1.5   |   help but cost you sleep:  ×0.6   |   naps cost you more than they give:  nothing
export function napRestoreShare(nap, verdict) {
  if (!nap) return 0;
  let share = clamp(nap.min / 90, 0, 1) * 0.5;
  if (verdict === 'helps') share *= 1.5;
  else if (verdict === 'mixed') share *= 0.6;
  else if (verdict === 'hurts') share = 0;
  return clamp(Math.round(share * 100) / 100, 0, NAPS.maxShare);
}
