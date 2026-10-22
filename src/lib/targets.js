// Where you should be for each signal, and how far today is from it.
import { fmtMinutes } from './time.js';
import { analyseSleep } from './sleep.js';

const n0 = (v) => Math.round(v).toLocaleString('en-GB');

export function targetSpecs(a) {
  const b = a.baseline;
  const env = a.envelope.steps;
  const specs = {};

  const sl = analyseSleep(a);
  specs.sleep = {
    key: 'sleep_min', label: 'Sleep', unit: '', better: 'higher',
    target: sl.need, band: [sl.need - 30, sl.need + 60], targetLabel: fmtMinutes(sl.need),
    fmt: fmtMinutes, diff: (d) => fmtMinutes(d),
    note: sl.learned
      ? `Target is your own need (${fmtMinutes(sl.need)}), learned from the sleep before your good days.`
      : 'Target is 8h (NHS range 7–9h) until Progress learns your own need.',
  };

  if (b.rhr != null) specs.rhr = {
    key: 'rhr', label: 'Resting heart rate', unit: ' bpm', better: 'lower',
    target: b.rhr, band: [b.rhr - 3, b.rhr + 3], targetLabel: `${Math.round(b.rhr)}`,
    fmt: (v) => `${Math.round(v)}`, diff: (d) => `${Math.round(d)} bpm`,
    note: `Target is your own normal (${Math.round(b.rhr)} bpm, from the last 28 days). Above the range means your body hasn’t fully recovered.`,
  };

  if (b.hrv != null) specs.hrv = {
    key: 'hrv', label: 'HRV', unit: ' ms', better: 'higher',
    target: b.hrv, band: [b.hrv * 0.9, b.hrv * 1.1], targetLabel: `${Math.round(b.hrv)}`,
    fmt: (v) => `${Math.round(v)}`, diff: (d) => `${Math.round(d)} ms`,
    note: `Target is your normal (${Math.round(b.hrv)} ms). Below the range means your nervous system is still under strain.`,
  };

  if (b.symptom != null) specs.symptom = {
    key: 'symptom', label: 'Symptoms', unit: '/10', better: 'lower',
    target: b.symptom, band: [Math.max(0, b.symptom - 1), b.symptom + 1], targetLabel: b.symptom.toFixed(1),
    fmt: (v) => v.toFixed(1), diff: (d) => `${d.toFixed(1)} points`,
    note: 'Target is your usual level. Bars above the line are worse-than-usual days; below are better days.',
  };

  const stepTarget = env.ready ? env.safe : b.steps;
  if (stepTarget) specs.steps = {
    key: 'steps', label: 'Steps', unit: '', better: 'lower',
    target: stepTarget, band: [stepTarget * 0.7, stepTarget], targetLabel: `${Math.round(stepTarget / 100) / 10}k`, short: (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`),
    hard: env.ready && env.risky ? env.risky : stepTarget * 1.3,
    floorZero: true, zeroBars: true,
    fmt: n0, diff: (d) => `${n0(d)} steps`,
    note: env.ready
      ? `The line is your envelope (~${n0(stepTarget)} steps). Under it is safe; bars above it are days you overdid it.`
      : `The line is your usual level (~${n0(stepTarget)} steps) until Progress has learned your envelope.`,
    overWord: env.ready ? 'over your envelope' : 'above your usual', underWord: 'under',
  };

  return specs;
}

// 'on' (in range), 'good' (better side), 'warn' (a little off), 'bad' (well off)
export function statusOf(v, spec) {
  if (v == null) return null;
  const [lo, hi] = spec.band;
  if (v >= lo && v <= hi) return 'on';
  const width = Math.max(hi - lo, 1e-6);
  const high = v > hi;
  const goodSide = spec.better === 'higher' ? high : !high;
  if (goodSide) return 'good';
  if (spec.hard != null && high) return v > spec.hard ? 'bad' : 'warn';
  const dist = high ? v - hi : lo - v;
  return dist > width ? 'bad' : 'warn';
}

export function describe(v, spec) {
  if (v == null) return 'No data';
  const [lo, hi] = spec.band;
  if (v >= lo && v <= hi) return 'In your target range';
  if (v > hi) return `${spec.diff(v - hi)} ${spec.overWord || 'above target'}`;
  return `${spec.diff(lo - v)} ${spec.underWord === 'under' ? 'under target — fine' : 'below target'}`;
}

export const STATUS_LABEL = { on: 'On target', good: 'Better than target', warn: 'A little off', bad: 'Well off target' };
