// POST /api/quick — one-tap energy log from the Apple Watch shortcut.
// Body: {"energy": "7"}  (anything starting with a number 0–10 works, e.g. "7 – OK")
import { guard, own, readBody, db, TZ, fail } from './_lib.js';
import { localDate } from '../src/lib/time.js';

export default async function handler(req, res) {
  const who = await guard(req, res, ['POST']);
  if (!who) return;
  try {
    const T = own(who);
    const b = readBody(req);
    const m = /-?\d+/.exec(String(b.energy ?? b._text ?? ''));
    if (!m) return res.status(400).send('Send an energy level from 0 to 10.');
    const energy = Math.min(10, Math.max(0, Number(m[0])));
    const now = new Date();
    const { error } = await T('quick_logs').insert({
      at: now.toISOString(), date: localDate(now, TZ), energy, note: b.note ? String(b.note).slice(0, 500) : null,
    });
    if (error) throw error;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(`Logged energy ${energy}/10`);
  } catch (err) {
    fail(res, err);
  }
}
