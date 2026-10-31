// POST /api/sleep-rebuild — recalculates every stored night (totals, stages, bedtime,
// wake time, wake-ups) from the raw sleep samples. Safe to run any time.
import { guard, own, TZ, fail, fetchAll } from './_lib.js';
import { summariseNights } from '../src/lib/ingest.js';

export default async function handler(req, res) {
  const who = await guard(req, res, ['POST']);
  if (!who) return;
  try {
    const T = own(who);
    const samples = await fetchAll(() => T('sleep_samples').select('start_at,end_at,stage').order('end_at'));
    const rows = summariseNights(samples, TZ);
    const now = new Date().toISOString();
    // Naps are re-detected from scratch (older versions could merge a morning nap into the night).
    const { error: napErr } = await T('daily_metrics').delete().in('metric', ['nap_min', 'nap_count', 'nap_start_min', 'nap_end_min']);
    if (napErr) throw napErr;
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await T('daily_metrics')
        .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), { onConflict: 'date,metric' });
      if (error) throw error;
    }
    const nights = new Set(rows.filter((r) => r.metric === 'sleep_min').map((r) => r.date)).size;
    const naps = new Set(rows.filter((r) => r.metric === 'nap_min').map((r) => r.date)).size;
    res.status(200).json({ ok: true, nights, naps, message: `Rebuilt ${nights} nights of sleep${naps ? ` and found ${naps} ${naps === 1 ? 'day' : 'days'} with a nap` : ''}.` });
  } catch (err) {
    fail(res, err);
  }
}
