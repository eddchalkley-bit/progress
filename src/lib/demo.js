// Realistic-looking sample data so the app can be explored before the watch is connected.
import { addDays } from './time.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDemoData(today, days = 84) {
  const r = rng(42);
  const metrics = [], checkins = [], quick = [], hrEvents = [], sessions = [];
  let evId = 1;
  const steps = [], screen = [], social = [], restsArr = [];
  let crashLeft = 0, crashPeak = 0, easeLeft = 0;
  const syms = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i - days + 1);
    const isToday = i === days - 1;
    const weekend = [0, 6].includes(new Date(date + 'T12:00:00Z').getUTCDay());

    // Daily choices
    let s = 3800 + r() * 3600 + (weekend ? 900 : 0);
    if (r() < 0.12) s += 4000 + r() * 3000; // occasional push
    // After a big day, some of the time you ease off for two days.
    if (crashLeft === 0 && easeLeft === 0 && (steps[i - 1] ?? 0) > 8800 && r() < 0.55) easeLeft = 2;
    const easing = easeLeft > 0;
    if (easing) { s = 2200 + r() * 1200; easeLeft--; }
    // The demo ends on a steady week with one slightly bigger day yesterday,
    // so every card has something useful to say (and it isn't mid-crash).
    const finale = i >= days - 9;
    if (finale) { s = 4300 + r() * 1100 + (weekend ? 500 : 0); if (i === days - 2) s = 7300; }
    if (crashLeft > 0) s = 1200 + r() * 1300;
    const sc = Math.round((easing ? 1.5 + r() * 1.5 : 2 + r() * 4.5 + (crashLeft > 0 ? 1.5 : 0)) * 2) / 2;
    const so = crashLeft > 0 || easing ? 0 : Math.min(3, Math.floor(r() * 3.4 + (weekend ? 0.6 : 0)));
    const rests = crashLeft > 0 || easing ? 3 : Math.min(3, Math.floor(r() * 3.2));
    steps.push(s); screen.push(sc); social.push(so); restsArr.push(rests);

    // Symptoms respond to the previous two days' load
    const over = (k) => Math.max(0, ((steps[i - k] ?? 5000) - 6200) / 1800);
    const load = 0.7 * over(1) + 0.5 * over(2) + 0.25 * Math.max(0, (screen[i - 1] ?? 3) - 4) + 0.35 * Math.max(0, (social[i - 1] ?? 1) - 1);
    let sym = 3 + load - 0.3 * ((restsArr[i - 1] ?? 1) - 1) + (r() - 0.5) * 1.4;
    const pushToday = Math.max(0, (s - 6200) / 1800) + 0.3 * Math.max(0, sc - 4);
    if (crashLeft === 0 && i < days - 15 && load + 0.9 * pushToday > 2.4 && r() < 0.85) { crashLeft = 3 + Math.floor(r() * 3); crashPeak = 7.2 + r() * 1.2; }
    let pem = false;
    if (crashLeft > 0) { sym = Math.max(sym, crashPeak - (5 - crashLeft) * 0.5); pem = crashLeft >= 3; crashLeft--; }
    sym = Math.max(0.5, Math.min(9.5, sym));
    syms.push(sym);

    const sleepMin = 472 - load * 18 + (r() - 0.5) * 70;
    const rhr = 60 + (sym - 3) * 1.6 + (r() - 0.5) * 2.2;
    const hrv = 44 - (sym - 3) * 3.4 + (r() - 0.5) * 6;
    const ex = crashLeft > 0 ? Math.round(r() * 4) : Math.round(Math.max(0, (s - 3500) / 260 + (r() - 0.5) * 8));

    const push = (metric, value) => metrics.push({ date, metric, value: Math.round(value * 10) / 10 });
    // Split screen time: weekdays are laptop-heavy (work), evenings and weekends phone-heavy.
    const laptopH = Math.round((weekend || crashLeft > 0 ? sc * 0.15 : sc * 0.6) * 4) / 4;
    const phoneH = Math.round((sc - laptopH) * 4) / 4;
    if (i >= days - 14) { push('phone_min', Math.round(phoneH * 60 * (isToday ? 0.4 : 1))); push('laptop_min', Math.round(laptopH * 60 * (isToday ? 0.5 : 1))); }
    const frac = isToday ? 0.42 : 1; // today is part-way through
    push('steps', Math.round(s * frac));
    push('exercise', Math.round(ex * frac));
    push('energy', Math.round((s * 0.045 + ex * 4) * frac));
    push('rhr', rhr);
    push('hrv', hrv);
    push('hr', rhr + 14 + (r() - 0.5) * 4);
    push('resp', Math.round((14.2 + (r() - 0.5) * 1.2) * 10) / 10);
    push('temp', Math.round((35.6 + (r() - 0.5) * 0.4) * 100) / 100);
    push('sleep_min', Math.round(sleepMin));
    push('deep_min', Math.round(sleepMin * 0.13));
    push('rem_min', Math.round(sleepMin * 0.21));
    push('core_min', Math.round(sleepMin * 0.66));
    const awake = Math.round(15 + load * 8 + r() * 15);
    push('awake_min', awake);
    const bed = Math.round(-40 + load * 25 + (weekend ? 35 : 0) + (r() - 0.5) * 70);
    push('bed_min', bed);
    push('wake_min', bed + Math.round(sleepMin) + awake + 10);
    push('wakeups', Math.max(0, Math.round(load * 1.2 + r() * 2.6)));

    if (!isToday && r() < 0.88) {
      const v = (bias) => Math.max(0, Math.min(10, Math.round(sym + bias + (r() - 0.5) * 2)));
      checkins.push({
        date, fatigue: v(0.8), brain_fog: v(0.3), breath: v(-1.2), aches: v(-0.6), heart: v(-1),
        am_fatigue: v(1.6), am_brain_fog: v(1.1), am_breath: v(-1), am_aches: v(0.4), am_heart: v(-0.6), am_rested: Math.max(0, Math.min(3, Math.round(1.5 + (r() - 0.5) * 2))),
        pem, screen_hours: sc, phone_hours: phoneH, laptop_hours: laptopH, social: so, rests, food: Math.max(1, Math.min(5, Math.round(3 + (r() - 0.5) * 2.4))), mental: Math.floor(r() * 3), stress: Math.floor(r() * 2.6), notes: null,
      });
    }
    if (easing) push('nap_min', 30 + Math.round(r() * 40));

    // Heart-rate spikes above the ceiling (resting + 15), tagged most of the time.
    const ceiling = 75;
    const nSpikes = isToday ? 2 : crashLeft > 0 ? 1 : Math.min(5, Math.floor((s / 3000) + so * 0.6 + r() * 1.5));
    const pool = ['walking', 'walking', 'chores', 'shower', 'driving', 'screens', 'eating', 'stress']
      .concat(Array(so * 2).fill('social')).concat(sc >= 5 ? ['screens', 'screens'] : []);
    let above = 0;
    for (let k = 0; k < nSpikes; k++) {
      let hour = 8 + Math.floor(r() * 12), min = Math.floor(r() * 60);
      if (isToday) { const at = new Date(Date.now() - (50 + k * 130) * 60000); if (k > 1) break; hour = at.getHours(); min = at.getMinutes(); }
      const start = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`);
      const minutes = 3 + Math.floor(r() * 18);
      const tag = isToday ? null : r() < 0.85 ? pool[Math.floor(r() * pool.length)] : null;
      above += minutes;
      hrEvents.push({ id: evId++, start_at: start.toISOString(), end_at: new Date(start.getTime() + minutes * 60000).toISOString(),
        peak: ceiling + 5 + Math.floor(r() * 30), minutes, source: 'auto', tag });
    }
    push('hr_above_min', above);
    if (r() < 0.35) quick.push({ at: date + 'T15:00:00Z', date, energy: Math.round(10 - sym), note: null });
  }
  return {
    metrics, checkins, quick, hr_events: hrEvents,
    screen_sessions: [{ kind: 'laptop', start_at: new Date(Date.now() - 52 * 60000).toISOString(), end_at: null }],
    syncs: [{ at: new Date(Date.now() - 95 * 60000).toISOString(), source: 'demo', lines: 41, metrics: 'rhr,hrv,steps,energy,exercise,sleep' }],
  };
}
