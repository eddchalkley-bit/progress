// POST /api/sleep-rebuild — recalculates every stored night (totals, stages, bedtime,
// wake time, wake-ups) from the raw sleep samples. Safe to run any time.
import { guard, db, TZ, fail, fetchAll } from './_lib.js';
import { summariseNights } from '../src/lib/ingest.js';

export default async function handler(req, res) {
  if (!guard(req, res, ['POST'])) return;
  try {
    const sb = db();
    const samples = await fetchAll(() => sb.from('sleep_samples').select('start_at,end_at,stage').order('end_at'));
    const rows = summariseNights(samples, TZ);
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await sb.from('daily_metrics')
        .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), { onConflict: 'date,metric' });
      if (error) throw error;
    }
    const nights = new Set(rows.filter((r) => r.metric === 'sleep_min').map((r) => r.date)).size;
    res.status(200).json({ ok: true, nights, message: `Rebuilt ${nights} nights of sleep.` });
  } catch (err) {
    fail(res, err);
  }
}
