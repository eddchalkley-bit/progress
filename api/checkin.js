// POST /api/checkin — save (or replace) the daily check-in for a date.
import { guard, readBody, db, TZ, fail } from './_lib.js';
import { localDate } from '../src/lib/time.js';

const int = (v, max) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : null;
};

export default async function handler(req, res) {
  if (!guard(req, res, ['POST'])) return;
  try {
    const b = readBody(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : localDate(new Date(), TZ);
    const hrs = (v) => (v === null || v === undefined || v === '' ? null : Math.min(24, Math.max(0, Math.round(Number(v) * 4) / 4)));
    const phone = hrs(b.phone_hours), laptop = hrs(b.laptop_hours);
    const screen = phone != null || laptop != null ? (phone || 0) + (laptop || 0) : hrs(b.screen_hours);
    if (b.part === 'morning') {
      const am = { date, updated_at: new Date().toISOString(), am_at: new Date().toISOString(), am_rested: int(b.am_rested, 3) };
      for (const k of ['fatigue', 'brain_fog', 'breath', 'aches', 'heart']) am[`am_${k}`] = int(b[`am_${k}`], 10);
      const { error } = await db().from('checkins').upsert(am, { onConflict: 'date' });
      if (error) {
        if (/am_[a-z_]+/.test(error.message || '')) throw new Error('The morning check-in needs a database update. Run the SQL in supabase/morning-checkin.sql in Supabase › SQL Editor, then try again.');
        throw error;
      }
      return res.status(200).json({ ok: true, checkin: am });
    }
    const row = {
      date,
      fatigue: int(b.fatigue, 10),
      brain_fog: int(b.brain_fog, 10),
      breath: int(b.breath, 10),
      aches: int(b.aches, 10),
      heart: int(b.heart, 10),
      pem: Boolean(b.pem),
      screen_hours: Number.isFinite(screen) ? screen : null,
      phone_hours: Number.isFinite(phone) ? phone : null,
      laptop_hours: Number.isFinite(laptop) ? laptop : null,
      social: int(b.social, 3),
      mental: int(b.mental, 3),
      stress: int(b.stress, 3),
      rests: int(b.rests, 3),
      food: b.food == null || b.food === '' ? null : Math.min(5, Math.max(1, Math.round(Number(b.food)) || 1)),
      notes: b.notes ? String(b.notes).slice(0, 2000) : null,
      updated_at: new Date().toISOString(),
    };
    let { error } = await db().from('checkins').upsert(row, { onConflict: 'date' });
    // If the database hasn't had a newer column added yet, save everything else rather than failing.
    for (let tries = 0; error && tries < 5; tries++) {
      const m = /'([a-z_]+)' column|column "?([a-z_]+)"? (?:of relation|does not exist)/i.exec(error.message || '');
      const col = m && (m[1] || m[2]);
      if (!col || !(col in row)) break;
      delete row[col];
      ({ error } = await db().from('checkins').upsert(row, { onConflict: 'date' }));
    }
    if (error) throw error;
    res.status(200).json({ ok: true, checkin: row });
  } catch (err) {
    fail(res, err);
  }
}
