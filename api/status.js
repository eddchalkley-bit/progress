// GET /api/status — a short text summary for the Apple Watch "Progress Status" shortcut.
// Add ?format=json for the full object.
import { guard, own, loadAll, TZ, fail } from './_lib.js';
import { analyse } from '../src/lib/analysis.js';
import { localDate } from '../src/lib/time.js';
import { dayPlan } from '../src/lib/suggestions.js';
import { analyseSleep } from '../src/lib/sleep.js';
import { energyBudget } from '../src/lib/energy.js';
import { recoveryFor } from '../src/lib/recovery.js';
import { fmtClock } from '../src/lib/time.js';

export default async function handler(req, res) {
  const who = await guard(req, res, ['GET']);
  if (!who) return;
  try {
    const data = await loadAll(who, 120);
    const a = analyse(data, localDate(new Date(), TZ));
    if (req.query?.format === 'json') return res.status(200).json(a.status);
    const plan = dayPlan(a);
    const sleep = analyseSleep(a);
    const energy = energyBudget(a, plan.factor, plan.hourFrac, sleep.potential);
    const rec = recoveryFor(a.days, a.days.length - 1);
    const extra = [];
    if (rec) extra.push(`Recovery ${rec.score}% of your normal`);
    if (energy.ready) extra.push(`Energy: ${energy.used} of ${energy.budget} EU used · crash line ${energy.crashLine}`);
    else if (plan.budget) extra.push(`Today: ~${plan.budget.toLocaleString('en-GB')} steps (${(plan.steps || 0).toLocaleString('en-GB')} so far)`);
    if (sleep.targetBed != null) extra.push(`Bed by ${fmtClock(sleep.targetBed)} tonight`);
    if (plan.tips[0]) extra.push(plan.tips[0].text);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send([a.statusText.split('\nEnvelope:')[0], ...extra].join('\n'));
  } catch (err) {
    fail(res, err);
  }
}
