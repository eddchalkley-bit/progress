// GET /api/status — a short text summary for the Apple Watch "Progress Status" shortcut.
// Add ?format=json for the full object.
import { guard, loadAll, TZ, fail } from './_lib.js';
import { analyse } from '../src/lib/analysis.js';
import { localDate } from '../src/lib/time.js';
import { dayPlan } from '../src/lib/suggestions.js';

export default async function handler(req, res) {
  if (!guard(req, res, ['GET'])) return;
  try {
    const data = await loadAll(120);
    const a = analyse(data, localDate(new Date(), TZ));
    if (req.query?.format === 'json') return res.status(200).json(a.status);
    const plan = dayPlan(a);
    const extra = [];
    if (plan.budget) extra.push(`Today: ~${plan.budget.toLocaleString('en-GB')} steps (${(plan.steps || 0).toLocaleString('en-GB')} so far)`);
    if (plan.tips[0]) extra.push(plan.tips[0].text);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send([a.statusText.split('\nEnvelope:')[0], ...extra].join('\n'));
  } catch (err) {
    fail(res, err);
  }
}
