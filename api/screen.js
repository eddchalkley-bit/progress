// POST /api/screen — screen-time events from Shortcuts automations.
//   {"kind": "phone",  "event": "open" | "close"}            ← App automation (chosen apps opened / closed)
//   {"kind": "laptop", "event": "start" | "stop" | "toggle"}  ← Work Focus on/off, or a one-tap toggle
import { guard, readBody, db, TZ, fail } from './_lib.js';
import { localDate } from '../src/lib/time.js';
import { CAPS, minutesByDay, fmtHM } from '../src/lib/screens.js';

async function recompute(sb, kind, day) {
  // Sessions starting on that local day (with a margin either side for time zones).
  const from = new Date(new Date(day + 'T00:00:00Z').getTime() - 14 * 3600e3).toISOString();
  const to = new Date(new Date(day + 'T00:00:00Z').getTime() + 38 * 3600e3).toISOString();
  const { data, error } = await sb.from('screen_sessions').select('kind,start_at,end_at').eq('kind', kind).gte('start_at', from).lt('start_at', to);
  if (error) throw error;
  const mins = minutesByDay(data, kind, TZ)[day] || 0;
  const { error: e2 } = await sb.from('daily_metrics').upsert({ date: day, metric: `${kind}_min`, value: Math.round(mins), updated_at: new Date().toISOString() }, { onConflict: 'date,metric' });
  if (e2) throw e2;
  return mins;
}

export default async function handler(req, res) {
  if (!guard(req, res, ['POST'])) return;
  try {
    const b = readBody(req);
    const kind = String(b.kind || '').toLowerCase().startsWith('lap') || /work|computer/.test(String(b.kind || '').toLowerCase()) ? 'laptop' : 'phone';
    let event = String(b.event || b._text || '').toLowerCase().trim();
    const sb = db();
    const now = new Date();
    const capMs = CAPS[kind] * 60000;
    const { data: openRows, error } = await sb.from('screen_sessions').select('id,start_at').eq('kind', kind).is('end_at', null).order('start_at', { ascending: false }).limit(5);
    if (error) throw error;
    const open = openRows || [];
    const closeAt = (s) => new Date(Math.min(now.getTime(), new Date(s.start_at).getTime() + capMs)).toISOString();

    if (event === 'toggle') event = open.length ? 'stop' : 'start';
    if (['opened', 'open', 'start', 'on'].includes(event)) event = 'start';
    if (['closed', 'close', 'stop', 'off'].includes(event)) event = 'stop';
    if (!['start', 'stop'].includes(event)) return res.status(400).send('event must be open/close (phone) or start/stop/toggle (laptop)');

    let msg = '';
    if (event === 'start') {
      if (kind === 'laptop' && open.length) {
        msg = `Laptop time already running since ${new Date(open[0].start_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}`;
      } else {
        for (const s of open) await sb.from('screen_sessions').update({ end_at: closeAt(s) }).eq('id', s.id);
        const { error: e } = await sb.from('screen_sessions').insert({ kind, start_at: now.toISOString(), app: b.app ? String(b.app).slice(0, 60) : null });
        if (e) throw e;
        msg = kind === 'laptop' ? 'Laptop time started' : 'ok';
      }
    } else {
      let minutes = 0;
      for (const s of open) {
        const end = closeAt(s);
        await sb.from('screen_sessions').update({ end_at: end }).eq('id', s.id);
        minutes += (new Date(end) - new Date(s.start_at)) / 60000;
      }
      msg = kind === 'laptop' ? (open.length ? `Laptop time stopped — ${fmtHM(minutes)}` : 'Laptop time wasn’t running') : 'ok';
    }
    const total = await recompute(sb, kind, localDate(now, TZ));
    if (kind === 'laptop') msg += `. Today: ${fmtHM(total)}.`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send(msg);
  } catch (err) {
    fail(res, err);
  }
}
