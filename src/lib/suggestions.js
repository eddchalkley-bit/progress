// Day plan, recovery mode, and "things I've noticed".
// Rule: Progress never suggests working out or building up activity. The envelope is a
// ceiling, and spare room is for things you value — not for training.
import { mean, median } from './analysis.js';
import { fmtMinutes, fmtDay, addDays } from './time.js';
import { triggerSummary, TAG_BY_ID } from './spikes.js';
import { screenHours, openLaptop, sessionMinutes, fmtHM } from './screens.js';

const fmtInt = (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-GB'));
const r100 = (v) => Math.round(v / 100) * 100;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const REST_LEVELS = ['0', '1–2', '3–4', '5+'];

// ---------- recovery mode ----------
export function recoveryState(a) {
  const days = a.days, t = days.length - 1;
  const ongoing = a.crashes.episodes.find((e) => e.ongoing);
  const typical = a.crashes.typicalRecovery;
  if (ongoing) {
    const base = ongoing.baseline;
    const latest = days[t].symptom ?? days[t - 1]?.symptom;
    const settling = latest != null && latest <= base + 2 && ongoing.daysSoFar >= 2;
    return {
      active: true, day: ongoing.daysSoFar, typical,
      phase: settling ? 'ease' : 'rest',
      phases: [
        { id: 'rest', title: 'Rest', text: 'Rest as much as you can until symptoms start to fall. Keep screens, conversation and decisions to a minimum.' },
        { id: 'ease', title: 'Ease in', text: 'As symptoms settle, keep to about half your envelope, in short bursts with rest between.' },
        { id: 'return', title: 'Return gently', text: 'Once you’ve had two settled days, go back up to your envelope over two or three days — not all at once.' },
      ],
    };
  }
  // Recently recovered: within 3 days of the end of the last episode.
  const last = a.crashes.episodes.filter((e) => !e.ongoing).slice(-1)[0];
  if (last && last.recoveryDays != null) {
    const startIdx = days.findIndex((d) => d.date === last.start);
    const recIdx = startIdx + last.recoveryDays;
    if (startIdx >= 0 && t - recIdx >= 0 && t - recIdx <= 2) {
      return { active: true, day: t - startIdx + 1, typical, phase: 'return', justRecovered: true,
        phases: [
          { id: 'rest', title: 'Rest', text: '' }, { id: 'ease', title: 'Ease in', text: '' },
          { id: 'return', title: 'Return gently', text: 'You’re back near your baseline. Build back to your envelope over two or three days — the urge to catch up is the most common trigger for the next crash.' },
        ] };
    }
  }
  return { active: false };
}

// ---------- day plan ----------
export function dayPlan(a, now = new Date()) {
  const days = a.days, t = days.length - 1, today = days[t], yday = days[t - 1] || {};
  const env = a.envelope.steps;
  const rec = recoveryState(a);
  const level = a.status.level;
  const reference = env.ready ? env.safe : a.baseline.steps;
  let factor = { green: 1, amber: 0.7, red: 0.5, building: 0.9 }[level] ?? 0.9;
  if (rec.active) factor = { rest: 0.4, ease: 0.5, return: 0.75 }[rec.phase];
  const budget = reference ? r100(reference * factor) : null;

  // Where you'd be by now if activity were spread evenly from 7am to 9pm.
  const h = now.getHours() + now.getMinutes() / 60;
  const frac = Math.min(1, Math.max(0, (h - 7) / 14));
  const byNow = budget ? r100(budget * frac) : null;
  const steps = today.steps ?? 0;
  let pace = null;
  if (budget && frac > 0.05) {
    if (steps > budget) pace = { tone: 'bad', text: `You’re over today’s budget. Rest for the remainder of the day where you can.` };
    else if (steps > byNow * 1.25 + 300) pace = { tone: 'warn', text: `Ahead of pace — about ${fmtInt(steps - byNow)} steps more than an even spread. A rest now will help.` };
    else pace = { tone: 'ok', text: `On pace. About ${fmtInt(budget - steps)} steps left for the rest of the day.` };
  }

  const restTarget = rec.active ? 'Most of the day' : { green: '3 or more', amber: '4 or more', red: 'Most of the day', building: '3 or more' }[level];

  // Suggestions — specific to today's signals first, then general pacing.
  const tips = [];
  const add = (id, text) => { if (!tips.find((x) => x.id === id)) tips.push({ id, text }); };
  const b = a.baseline;
  if (today.sleep_min != null && today.sleep_min < 390) add('sleep', `Short night (${fmtMinutes(today.sleep_min)}). Plan a lie-down in the early afternoon, eyes closed, even if you don’t sleep.`);
  if (today.hrv != null && b.hrv && today.hrv < b.hrv * 0.9) add('hrv', 'HRV is low this morning. Keep tasks to about 20 minutes, then sit or lie down before the next one.');
  if (today.rhr != null && b.rhr != null && today.rhr - b.rhr >= 3) add('rhr', 'Resting heart rate is up. Do things sitting down where you can — showering, cooking prep, getting dressed.');
  const usualAbove = median(days.slice(-29, -1).map((d) => d.hr_above_min));
  if (today.hr_above_min != null && today.hr_above_min >= Math.max(15, (usualAbove || 0) * 1.5)) add('hrAbove', `Your heart rate has been above your ceiling for ${Math.round(today.hr_above_min)} min today. Sit or lie down until it settles before the next thing.`);
  const yc = yday.checkin || {};
  if (yc.social >= 2) add('social', 'Yesterday was socially busy. Keep today quiet — short messages rather than calls or visits.');
  if (yc.mental >= 2) add('mental', 'Yesterday took a lot of thinking. Move one demanding task (emails, planning, admin) to another day.');
  const lap = openLaptop(a.screenSessions);
  if (lap) {
    const m = sessionMinutes(lap, now.getTime());
    if (m >= 45) add('laptopNow', `Laptop on for ${fmtHM(m)} without a break. Stop now for 10 minutes — eyes closed, away from the screen.`);
  }
  const ys = screenHours(yday);
  if (ys.total != null && ys.total >= 5) add('screen', `${fmtHM(ys.total * 60)} of screens yesterday${ys.laptop != null && ys.phone != null ? ` (${fmtHM(ys.laptop * 60)} laptop, ${fmtHM(ys.phone * 60)} phone)` : ''}. Try screen-free rests today — audio, or simply lying still.`);
  if ((yday.steps ?? 0) > (reference || Infinity) * 1.15) add('yday', 'Yesterday was a bigger day. Crashes can lag one to three days, so stay below your budget even if you feel fine.');

  const byLevel = {
    green: [
      'Rest before you feel tired, not after — set a reminder every 60–90 minutes.',
      'If you have some room today, spend it on something you value, not on catching up.',
      'Break bigger jobs into parts and spread them across the week.',
    ],
    amber: [
      'Cut today’s plans back by about a third and drop anything that can wait.',
      'Alternate: 15–20 minutes of activity, then a proper rest.',
      'Lighten thinking and social load too — they use the same energy.',
    ],
    red: [
      'Clear the day. Only essentials, done sitting or lying where possible.',
      'Rest in a dark, quiet room — no scrolling.',
      'Ask for help with anything that can be shared.',
    ],
    building: [
      'Check in each evening so Progress can learn your baseline.',
      'Rest before you feel tired, not after.',
      'Spread activity through the day instead of doing it all at once.',
    ],
  };
  tips.sort((x, y) => (y.id === 'laptopNow') - (x.id === 'laptopNow'));
  const pool = rec.active ? byLevel.red : byLevel[level] || byLevel.building;
  for (const p of pool) add(p, p);

  // Screens today vs a screen budget (learned like the step envelope), scaled the same way.
  const ts = screenHours(today);
  const sEnv = a.envelope.screen;
  const screenBudget = sEnv?.ready ? Math.round(sEnv.safe * (rec.active ? 0.5 : factor) * 4) / 4 : null;
  const laptopOpen = lap ? sessionMinutes(lap, now.getTime()) : null;
  const screens = { phone: ts.phone, laptop: ts.laptop, total: ts.total, tracked: ts.tracked, budget: screenBudget, laptopOpen };

  return { screens, budget, byNow, steps, pace, factor, reference, envReady: env.ready, restTarget, tips: tips.slice(0, 4), recovery: rec, hourFrac: frac };
}

// ---------- things I've noticed ----------
export function noticings(a) {
  const days = a.days, t = days.length - 1, flags = a.crashes.flags, sb = a.symBase;
  const env = a.envelope.steps, b = a.baseline;
  const out = [];
  const range = (from, to) => days.slice(Math.max(0, from), Math.max(0, to));

  // Steady days: last 14 vs previous 14
  const steadyPct = (from, to) => {
    let n = 0, s = 0;
    for (let i = Math.max(0, from); i < to; i++) {
      const d = days[i];
      if (d.symptom == null || sb[i] == null) continue;
      n++; if (!flags[i] && d.symptom <= sb[i] + 1) s++;
    }
    return n >= 7 ? s / n : null;
  };
  const now14 = steadyPct(t - 13, t + 1), prev14 = steadyPct(t - 27, t - 13);
  if (now14 != null && prev14 != null) {
    const d = Math.round((now14 - prev14) * 100);
    if (d >= 10) out.push({ tone: 'good', score: 3, title: 'More steady days', text: `${Math.round(now14 * 100)}% of the last two weeks were steady, up from ${Math.round(prev14 * 100)}% the fortnight before.` });
    else if (d <= -15) out.push({ tone: 'watch', score: 4, title: 'Fewer steady days', text: `${Math.round(now14 * 100)}% of the last two weeks were steady, down from ${Math.round(prev14 * 100)}%. Worth easing back for a few days.` });
  }

  // Crashes: last 30 vs previous 30
  const startsIn = (from, to) => a.crashes.episodes.filter((e) => {
    const i = days.findIndex((d) => d.date === e.start); return i >= from && i < to;
  }).length;
  if (days.length >= 50) {
    const c1 = startsIn(t - 29, t + 1), c0 = startsIn(t - 59, t - 29);
    if (c1 < c0) out.push({ tone: 'good', score: 3, title: 'Fewer crashes', text: `${c1} ${c1 === 1 ? 'crash' : 'crashes'} in the last 30 days, compared with ${c0} the month before.` });
    else if (c1 > c0 && c1 >= 2) out.push({ tone: 'watch', score: 3, title: 'More crashes this month', text: `${c1} crashes in the last 30 days, compared with ${c0} before. Your envelope may need to come down for a while.` });
  }

  // Sleep under 7h
  const sleeps = range(t - 6, t + 1).map((d) => d.sleep_min).filter((v) => v != null);
  if (sleeps.length >= 4) {
    const short = sleeps.filter((v) => v < 420).length;
    if (short >= 4) out.push({ tone: 'watch', score: 3, title: 'Short nights', text: `Under 7 hours on ${short} of the last ${sleeps.length} nights. A fixed wind-down time and a dark, cool room can help — and count daytime rest as part of recovery.` });
    else if (short === 0) out.push({ tone: 'good', score: 1, title: 'Good run of sleep', text: `7 hours or more every night for the last ${sleeps.length} nights.` });
  }

  // HRV / RHR trend: last 7 days vs the 28 before
  const trend = (key) => {
    const recent = mean(range(t - 6, t + 1).map((d) => d[key]));
    const before = median(range(t - 34, t - 6).map((d) => d[key]));
    return recent != null && before != null ? { recent, before } : null;
  };
  const hrv = trend('hrv');
  if (hrv) {
    const pct = (hrv.recent - hrv.before) / hrv.before;
    if (pct >= 0.08) out.push({ tone: 'good', score: 2, title: 'HRV rising', text: `Your 7-day HRV average is ${Math.round(hrv.recent)} ms, up from ${Math.round(hrv.before)} ms — a sign you’re recovering better.` });
    else if (pct <= -0.1) out.push({ tone: 'watch', score: 3, title: 'HRV falling', text: `Your 7-day HRV average is ${Math.round(hrv.recent)} ms, down from ${Math.round(hrv.before)} ms. Your body may be under more strain than it feels.` });
  }
  const rhr = trend('rhr');
  if (rhr) {
    const d = rhr.recent - rhr.before;
    if (d >= 3) out.push({ tone: 'watch', score: 3, title: 'Resting heart rate creeping up', text: `Averaging ${Math.round(rhr.recent)} bpm this week vs ${Math.round(rhr.before)} before. Common after overdoing it, or with an infection.` });
    else if (d <= -2) out.push({ tone: 'good', score: 2, title: 'Resting heart rate settling', text: `Averaging ${Math.round(rhr.recent)} bpm this week, down from ${Math.round(rhr.before)}.` });
  }

  // Boom and bust
  if (env.ready) {
    let over = 0, dipped = 0;
    for (let i = Math.max(0, t - 28); i < t; i++) {
      if ((days[i].steps ?? 0) > env.safe * 1.3) {
        over++;
        const after = [days[i + 1], days[i + 2]].map((d, k) => (d?.symptom != null && sb[i + 1 + k] != null ? d.symptom - sb[i + 1 + k] : null));
        if (after.some((x) => x != null && x >= 1.5) || flags[i + 1] || flags[i + 2] || flags[i + 3]) dipped++;
      }
    }
    if (over >= 3) out.push({ tone: 'watch', score: dipped >= 2 ? 5 : 3, title: 'Boom-and-bust pattern', text: `You went well over your envelope on ${over} days this month${dipped ? `, and ${dipped} of them were followed by a dip` : ''}. Spreading the same activity over more days is gentler.` });

    // Streak inside the envelope (ending yesterday)
    let streak = 0;
    for (let i = t - 1; i >= 0; i--) { if (days[i].steps != null && days[i].steps <= env.safe && !flags[i]) streak++; else break; }
    if (streak >= 5) out.push({ tone: 'good', score: 2, title: `${streak} days inside your envelope`, text: 'Steady pacing like this is what lets your baseline rise over time.' });
  }

  // Weekday pattern
  if (days.length >= 42) {
    const by = Array.from({ length: 7 }, () => []);
    for (const d of days) if (d.steps != null && d.date !== days[t].date) by[new Date(d.date + 'T12:00:00Z').getUTCDay()].push(d.steps);
    const means = by.map((v) => (v.length >= 4 ? mean(v) : null));
    const overall = mean(days.slice(0, t).map((d) => d.steps));
    const maxI = means.reduce((m, v, i) => (v != null && (m < 0 || v > means[m]) ? i : m), -1);
    if (maxI >= 0 && overall && means[maxI] > overall * 1.2) {
      out.push({ tone: 'note', score: 2, title: `${WEEKDAYS[maxI]}s are your busiest`, text: `About ${fmtInt(r100(means[maxI]))} steps on average, ${Math.round((means[maxI] / overall - 1) * 100)}% above your usual. Keep ${WEEKDAYS[(maxI + 1) % 7]}s light.` });
    }
  }

  // Rest breaks
  const restEffect = () => {
    const hi = [], lo = [];
    for (let i = 0; i < t; i++) {
      const r = days[i].checkin?.rests;
      const next = days[i + 1]?.symptom;
      if (r == null || next == null) continue;
      (r >= 2 ? hi : lo).push(next);
    }
    return hi.length >= 4 && lo.length >= 4 ? mean(lo) - mean(hi) : null;
  };
  const re = restEffect();
  if (re != null && re >= 0.5) out.push({ tone: 'good', score: 4, title: 'Rest breaks are working', text: `The day after you took 3 or more rest breaks, symptoms averaged ${re.toFixed(1)} points lower.` });

  // Screens
  const screenEffect = () => {
    const hi = [], lo = [];
    for (let i = 0; i < t; i++) {
      const s = screenHours(days[i]).total, next = days[i + 1]?.symptom;
      if (s == null || next == null) continue;
      (s >= 5 ? hi : lo).push(next);
    }
    return hi.length >= 4 && lo.length >= 4 ? mean(hi) - mean(lo) : null;
  };
  const se = screenEffect();
  if (se != null && se >= 0.7) out.push({ tone: 'watch', score: 3, title: 'Long screen days cost you', text: `After days with 5+ hours of screens, symptoms were ${se.toFixed(1)} points higher the next day.` });

  // Heart-rate triggers
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const trig = triggerSummary(a.events, addDays(a.today, -13), tz);
  const taggedN = trig.total - trig.untagged;
  if (trig.list.length && taggedN >= 4) {
    const top = trig.list[0];
    const share = Math.round((top.minutes / Math.max(1, trig.list.reduce((x, r) => x + r.minutes, 0))) * 100);
    if (share >= 30) out.push({ tone: 'note', score: 3, title: `${TAG_BY_ID[top.tag]?.label || top.tag} raises your heart rate most`, text: `${share}% of your tagged time above the ceiling in the last two weeks (${top.count} spikes).${TAG_BY_ID[top.tag]?.idea ? ' ' + TAG_BY_ID[top.tag].idea : ''}` });
  }
  if (trig.untagged >= 3) out.push({ tone: 'note', score: 2, title: `${trig.untagged} spikes waiting to be tagged`, text: 'Tagging them takes a tap each and sharpens what Progress can tell you.' });

  // Check-in consistency
  const recentCheckins = range(t - 6, t + 1).filter((d) => d.checkin).length;
  if (recentCheckins < 4 && a.coverage.days >= 7) out.push({ tone: 'note', score: 1, title: 'A few missed check-ins', text: `${recentCheckins} check-ins in the last week. Even a quick one helps Progress spot what affects you.` });

  const order = { watch: 0, good: 1, note: 2 };
  return out.sort((x, y) => y.score - x.score || order[x.tone] - order[y.tone]).slice(0, 5);
}

// ---------- progress over time (4-week blocks) ----------
export function progressBlocks(a, blocks = 3) {
  const days = a.days, t = days.length - 1, flags = a.crashes.flags, sb = a.symBase;
  const out = [];
  for (let k = blocks - 1; k >= 0; k--) {
    const to = t + 1 - k * 28, from = to - 28;
    if (from < 0) continue;
    const slice = days.slice(from, to);
    let n = 0, steady = 0;
    for (let i = from; i < to; i++) {
      if (days[i].symptom == null || sb[i] == null) continue;
      n++; if (!flags[i] && days[i].symptom <= sb[i] + 1) steady++;
    }
    const crashes = a.crashes.episodes.filter((e) => { const i = days.findIndex((d) => d.date === e.start); return i >= from && i < to; }).length;
    out.push({
      label: k === 0 ? 'Now' : `${k * 4} wks before`,
      sub: `from ${fmtDay(days[from].date, { day: 'numeric', month: 'short' })}`,
      symptom: mean(slice.map((d) => d.symptom)),
      steady: n >= 7 ? steady / n : null,
      crashes,
      sleep: mean(slice.map((d) => d.sleep_min)),
      hrv: mean(slice.map((d) => d.hrv)),
    });
  }
  return out;
}
