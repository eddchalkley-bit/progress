// POST /api/tag — tag a heart-rate spike.
//   {"id": 42, "tag": "Social"}  → tags that spike (from the sync prompt or the app)
//   {"tag": "Driving"}           → from the watch: tags a spike in the last 30 min, or logs the moment
import { guard, own, readBody, db, TZ, fail } from './_lib.js';
import { normaliseTag, TAG_BY_ID, timeLabel } from '../src/lib/spikes.js';

export default async function handler(req, res) {
  const who = await guard(req, res, ['POST']);
  if (!who) return;
  try {
    const b = readBody(req);
    const tag = normaliseTag(b.tag ?? b._text);
    if (!tag) return res.status(400).send('Choose what it was.');
    const T = own(who);
    const now = new Date();
    const fields = { tag, tagged_at: now.toISOString(), note: b.note ? String(b.note).slice(0, 300) : null };
    let msg;
    if (b.id != null && b.id !== '') {
      const { error } = await T('hr_events').update(fields).eq('id', Number(b.id));
      if (error) throw error;
      msg = `Tagged as ${TAG_BY_ID[tag].label}`;
    } else {
      const { data: recent } = await T('hr_events').select('id,start_at').eq('source', 'auto')
        .gte('end_at', new Date(now - 30 * 60000).toISOString()).order('start_at', { ascending: false }).limit(1);
      if (recent?.length) {
        const { error } = await T('hr_events').update(fields).eq('id', recent[0].id);
        if (error) throw error;
        msg = `Tagged the ${timeLabel(recent[0].start_at, TZ)} spike as ${TAG_BY_ID[tag].label}`;
      } else {
        const { error } = await T('hr_events').insert({ ...fields, start_at: now.toISOString(), end_at: now.toISOString(), source: 'manual', minutes: 0 });
        if (error) throw error;
        msg = `Logged: ${TAG_BY_ID[tag].label}. It’ll be matched to your heart rate at the next sync.`;
      }
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(msg);
  } catch (err) {
    fail(res, err);
  }
}
