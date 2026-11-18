// Morning stability: a 1–5 guide to how settled your body's signals are this morning,
// measured against YOUR normal (recent calm days, crash days left out). It combines
// HRV, resting heart rate, last night's sleep and your recent symptoms.
// It describes today's signals; it does not predict a crash. If it disagrees with how
// you feel, trust how you feel.
import { rollingBaseline } from './analysis.js';
import { fmtMinutes } from './time.js';

export const STABILITY_WORDS = { 5: 'Very stable', 4: 'Stable', 3: 'Slightly unsettled', 2: 'Unsettled', 1: 'Very unsettled' };
const MIN_FACTORS = 2;

const pickToday = (days, t, key) => {
  if (days[t]?.[key] != null) return { value: days[t][key], stale: false };
  if (days[t - 1]?.[key] != null) return { value: days[t - 1][key], stale: true };
  return null;
};

export function morningStability(a) {
  const days = a.days, t = days.length - 1;
  if (t < 7 || !a.coverage || a.coverage.watchDays < 7) return null;
  const factors = [];
  let loss = 0;
  const add = (key, loss_, level, text) => { loss += loss_; factors.push({ key, level, text }); };

  // HRV
  const hrv = pickToday(days, t, 'hrv'), hrvBase = rollingBaseline(days, t, (d) => d.hrv);
  if (hrv && hrvBase) {
    const pct = (hrv.value - hrvBase) / hrvBase, down = Math.round(-pct * 100);
    const note = hrv.stale ? ' (yesterday’s reading)' : '';
    if (pct <= -0.2) add('hrv', 2, 'alert', `HRV ${down}% below your normal${note}`);
    else if (pct <= -0.1) add('hrv', 1, 'warn', `HRV ${down}% below your normal${note}`);
    else if (pct <= -0.05) add('hrv', 0.5, 'warn', `HRV slightly below your normal${note}`);
    else factors.push({ key: 'hrv', level: 'ok', text: `HRV in your normal range${note}` });
  }
  // Resting heart rate
  const rhr = pickToday(days, t, 'rhr'), rhrBase = rollingBaseline(days, t, (d) => d.rhr);
  if (rhr && rhrBase != null) {
    const d = rhr.value - rhrBase, note = rhr.stale ? ' (yesterday’s reading)' : '';
    if (d >= 5) add('rhr', 2, 'alert', `Resting heart rate ${Math.round(d)} bpm above your normal${note}`);
    else if (d >= 3) add('rhr', 1, 'warn', `Resting heart rate ${Math.round(d)} bpm above your normal${note}`);
    else if (d >= 2) add('rhr', 0.5, 'warn', `Resting heart rate a little above your normal${note}`);
    else factors.push({ key: 'rhr', level: 'ok', text: `Resting heart rate in your normal range${note}` });
  }
  // Sleep
  const sleep = days[t]?.sleep_min, sleepBase = rollingBaseline(days, t, (d) => d.sleep_min);
  if (sleep != null && sleepBase != null) {
    const short = sleepBase - sleep;
    const txt = `${fmtMinutes(sleep)} last night vs your usual ${fmtMinutes(sleepBase)}`;
    if (short >= 120) add('sleep', 1.5, 'alert', `Short night: ${txt}`);
    else if (short >= 75) add('sleep', 1, 'warn', `Short night: ${txt}`);
    else if (short >= 45) add('sleep', 0.5, 'warn', `A bit short: ${txt}`);
    else factors.push({ key: 'sleep', level: 'ok', text: `Sleep close to your usual (${fmtMinutes(sleep)})` });
  }
  // Symptoms: this morning's check-in if done, otherwise yesterday's evening one
  const symNow = days[t]?.morning != null ? { v: days[t].morning, when: 'This morning' }
    : days[t - 1]?.symptom != null ? { v: days[t - 1].symptom, when: 'Yesterday' } : null;
  const symBase = a.symBase?.[days[t]?.morning != null ? t : t - 1];
  if (symNow && symBase != null) {
    const d = symNow.v - symBase;
    if (d >= 2) add('symptom', 1.5, 'alert', `${symNow.when}’s symptoms ${d.toFixed(1)} points above your baseline`);
    else if (d >= 1) add('symptom', 0.75, 'warn', `${symNow.when}’s symptoms a little above your baseline`);
    else factors.push({ key: 'symptom', level: 'ok', text: `${symNow.when}’s symptoms near your baseline` });
  }
  if (factors.length < MIN_FACTORS) return null;

  let score = loss < 0.5 ? 5 : loss < 1.5 ? 4 : loss < 3 ? 3 : loss < 4.5 ? 2 : 1;
  const inCrash = a.crashes.flags[t];
  if (inCrash) score = 1;
  else if (a.crashes.flags[t - 1]) score = Math.min(score, 2);
  if (inCrash || a.crashes.flags[t - 1]) factors.unshift({ key: 'crash', level: 'alert', text: inCrash ? 'You’re in a crash today' : 'You had a crash yesterday' });

  const order = { alert: 0, warn: 1, ok: 2 };
  factors.sort((x, y) => order[x.level] - order[y.level]);
  return { score, word: STABILITY_WORDS[score], factors, partial: factors.length < 4 };
}
