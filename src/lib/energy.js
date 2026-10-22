// Energy budget — one number for "how much of today have I used".
// Pure functions on top of analyse(): no extra data, tables or shortcuts needed.
//
// Units: EU (energy units).
//   Physical: 1 EU ≈ 10 kcal of active energy (or ≈ 250 steps when energy is missing).
//   Stress:   minutes with heart rate above your ceiling, plus the stress / mental-load
//             ratings from the end-of-day check-in when you've filled it in.
// Load counts across days because crashes usually lag 1–3 days, so today's budget and
// crash line both subtract what's still "carried" from the last two days.
import { median, percentile } from './analysis.js';

export const ENERGY = {
  kcalPerEU: 10,
  stepsPerEU: 250,          // fallback when active energy hasn't synced
  euPerMinAboveCeiling: 0.5,
  euPerCheckinPoint: 4,     // stress / mental 0–3 each
  carry1: 0.5,              // share of yesterday's load still counting today
  carry2: 0.25,             // share of the day before
  window: 28,
  thresholdMargin: 0.9,     // crash line sits 10% under your typical pre-crash load
  defaultThresholdX: 1.35,  // until 2 crashes are logged: crash line = normal × this
  minCrashes: 2,
  amberAt: 0.85,            // amber zone starts at 85% of the crash line
};

export function dayLoad(d, k = ENERGY) {
  if (!d) return { physical: 0, stress: 0, total: 0, has: false };
  const physical = d.energy != null ? d.energy / k.kcalPerEU : d.steps != null ? d.steps / k.stepsPerEU : 0;
  let stress = (d.hr_above_min ?? 0) * k.euPerMinAboveCeiling;
  const c = d.checkin;
  if (c) stress += ((Number(c.stress) || 0) + (Number(c.mental) || 0)) * k.euPerCheckinPoint;
  const has = d.energy != null || d.steps != null || d.hr_above_min != null;
  return { physical, stress, total: physical + stress, has };
}

/**
 * a:      result of analyse()
 * factor: today's capacity multiplier (dayPlan's factor: green 1, amber 0.7, red 0.5, recovery lower)
 * frac:   share of the waking day gone (dayPlan's hourFrac) — used for the "even pace" marker
 * potential: what last night's sleep and overnight recovery did to today's capacity
 *            (analyseSleep().potential, ×your normal, 0.7–1.1)
 */
export function energyBudget(a, factor = 1, frac = null, potential = 1, k = ENERGY) {
  const days = a.days, t = days.length - 1;
  const flags = a.crashes?.flags || [];
  const L = (i) => (i >= 0 ? dayLoad(days[i], k).total : 0);
  const W = (i) => L(i) + k.carry1 * L(i - 1) + k.carry2 * L(i - 2);

  // Your normal: weighted load on settled days (no crash that day or the next two).
  const normal = [];
  for (let i = Math.max(2, t - k.window); i < t; i++) {
    if (!dayLoad(days[i], k).has) continue;
    if (flags[i] || flags[i + 1] || flags[i + 2]) continue;
    normal.push(W(i));
  }
  const baseline = median(normal);

  // Crash line, learned from the load running into each crash (the onset day and the day before).
  const onsets = [];
  for (let i = 1; i < t; i++) if (flags[i] && !flags[i - 1]) onsets.push(Math.max(W(i), W(i - 1)));
  const crashLoads = onsets.filter((x) => x > 0);
  const learned = crashLoads.length >= k.minCrashes;

  const ready = baseline != null && normal.length >= 5;
  if (!ready) {
    return { ready: false, daysNeeded: Math.max(0, 5 - normal.length), today: dayLoad(days[t], k) };
  }

  let crashW = learned ? percentile(crashLoads, 0.25) * k.thresholdMargin : baseline * k.defaultThresholdX;
  if (crashW < baseline * 1.05) crashW = baseline * 1.05; // never put the crash line under your normal

  const carry = k.carry1 * L(t - 1) + k.carry2 * L(t - 2);
  const today = dayLoad(days[t], k);
  const used = today.total;
  // A poor night lowers both today's budget and how much you can take before crashing.
  // A great night raises your potential, but the budget doesn't rise past your normal:
  // banking a good night is what builds the baseline.
  const sleepCap = Math.min(1, potential);
  const potentialEU = baseline * potential - carry;
  const budget = Math.max(0, baseline * Math.min(factor, sleepCap) - carry);
  const crashLine = Math.max(budget * 1.05, crashW * Math.min(1.05, potential) - carry);
  const amberLine = Math.max(budget, crashLine * k.amberAt);
  const byNow = frac != null && frac > 0.05 && frac < 1 ? budget * frac : null;

  let status = 'green';
  if (used >= crashLine) status = 'red';
  else if (used >= amberLine || used > budget) status = 'amber';

  const r = Math.round;
  return {
    ready: true,
    used: r(used), physical: r(today.physical), stress: r(today.stress),
    budget: r(budget), crashLine: r(crashLine), amberLine: r(amberLine),
    byNow: byNow != null ? r(byNow) : null,
    carry: r(carry), normal: r(baseline), factor, potential, potentialEU: r(Math.max(0, potentialEU)),
    sleepDelta: r(baseline * (potential - 1)),
    status, learned, crashesLogged: crashLoads.length,
    yesterday: r(L(t - 1)),
  };
}
