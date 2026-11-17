// One budget, one source. Today, the 7-day card, Insights and the Watch text all read from here, so they can't disagree.
//
// todayModel(a): today's step plan, sleep and energy budget, with the energy budget (carried-over load, last night's
//                sleep, today's status) allowed to LOWER the step budget, never raise it.
// budgetHistory(a, m, n): each recent day's load against that morning's budget, both in steps' worth.
//                A past day's budget uses only what was known that morning (sleep and the previous two days);
//                today's row uses today's real budget, which also includes today's status.
import { energyBudget, dayLoad, stepsPerUnit, ENERGY } from './energy.js';
import { analyseSleep, viewAt } from './sleep.js';
import { dayPlan } from './suggestions.js';

export function todayModel(a, now = new Date()) {
  const plan0 = dayPlan(a, now);
  const sleep = analyseSleep(a);
  const raw = energyBudget(a, plan0.factor, plan0.hourFrac, sleep.potential, undefined, sleep.nap.verdict);
  const spu = stepsPerUnit(raw, plan0);
  const plan = spu && plan0.budget ? dayPlan(a, now, { budgetCap: raw.budget * spu }) : plan0;
  const usualDay = raw.ready ? raw.normal / (1 + ENERGY.carry1 + ENERGY.carry2) : null;
  const energy = { ...raw, napLift: sleep.napLift, stepsPerUnit: spu, usualDay };
  return { plan, plan0, sleep, energy, spu, reference: plan0.reference ?? null };
}

export function budgetHistory(a, m, n = 7) {
  if (!m.spu || !m.reference) return null;
  const k = { ...ENERGY, napVerdict: m.sleep.nap.verdict };
  const t = a.days.length - 1;
  const grace = m.reference * 0.1;            // within 10% of a usual day over the budget is "just over", not over
  const rows = [];
  for (let i = Math.max(0, t - n + 1); i <= t; i++) {
    const d = a.days[i];
    const load = dayLoad(d, k);
    let budget = null, used = load.has ? load.total : null;
    if (i === t) {
      budget = m.energy.ready ? m.energy.budget : null;
      used = m.energy.ready ? m.energy.used : used;
    } else {
      const view = viewAt(a, i);
      const e = energyBudget(view, 1, null, analyseSleep(view).potential, undefined, m.sleep.nap.verdict);
      if (e.ready) budget = e.budget;
    }
    const did = used != null ? used * m.spu : null;
    const limit = budget != null ? budget * m.spu : null;
    rows.push({
      idx: i, date: d.date, did, exertion: did, limit,
      over: did != null && limit != null ? did > limit + grace : null,
      partial: i === t, crash: Boolean(a.crashes.flags[i]),
    });
  }
  return rows;
}

export function limitSummary(rows) {
  const full = rows.filter((r) => !r.partial && r.over != null);
  const over = full.filter((r) => r.over).length;
  let verdict, tone, text;
  if (!full.length) { verdict = 'Building'; tone = 'none'; text = 'Needs a few days of data.'; }
  else if (over === 0) {
    verdict = 'Pacing well'; tone = 'good';
    text = full.length === 1 ? 'You stayed within your budget yesterday.' : `You stayed within your budget on all ${full.length} days. Keeping it this way gives your body the best chance to recover.`;
  } else if (over <= Math.max(1, Math.floor(full.length / 4))) {
    verdict = 'Mostly within budget'; tone = 'good';
    text = `You went over on ${over} of ${full.length} days. Crashes can lag by a day or two, so watch the days after.`;
  } else {
    verdict = 'Pushing past your budget'; tone = 'warn';
    text = `You went over on ${over} of ${full.length} days. Try to bring the busier days down. A budget that’s already low after a short night or busy days is the one to protect most.`;
  }
  return { over, total: full.length, verdict, tone, text };
}

// Did a crash follow over-budget days more often than days within budget? (a crash flagged in the next two days)
export function crashAfter(a, rows) {
  const t = a.days.length - 1;
  const g = { over: { n: 0, crash: 0 }, ok: { n: 0, crash: 0 } };
  for (const r of rows) {
    if (r.partial || r.over == null || r.idx + 2 > t) continue;
    const x = r.over ? g.over : g.ok;
    x.n++;
    if (a.crashes.flags[r.idx + 1] || a.crashes.flags[r.idx + 2]) x.crash++;
  }
  return g;
}
