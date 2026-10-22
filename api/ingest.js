// POST /api/ingest — called by the "Progress Sync" shortcut with Apple Health readings.
import { guard, own, readBody, db, TZ, fail } from './_lib.js';
import { parseLines, summariseNights, nightOf, fromColumns } from '../src/lib/ingest.js';
import { addDays, fmtMinutes, localDate } from '../src/lib/time.js';
import { detectSpikes, minutesByDay, eventLabel } from '../src/lib/spikes.js';
import { median } from '../src/lib/analysis.js';

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default async function handler(req, res) {
  const who = await guard(req, res, ['POST']);
  if (!who) return;
  try {
    const body = readBody(req);
    // Accept the readings under any key (lines, Lines, text…) — use the longest text value sent.
    const pick = (v) => (Array.isArray(v) ? v.join('\n') : typeof v === 'string' ? v : '');
    let text = pick(body.lines ?? body._text);
    for (const v of Object.values(body)) { const t = pick(v); if (t.length > text.length) text = t; }
    // Simple format: {type, values, starts, ends} — one Find Health Samples per request, no loops.
    if (body.type && body.values != null) {
      text = fromColumns(body, TZ);
      if (!text) text = '';
    }
    const { rows, sleep, hrSamples, invalid, examplesInvalid } = parseLines(text, TZ);
    const sb = db();
    const T = own(who);
    const now = new Date().toISOString();

    for (const part of chunk(rows.map((r) => ({ ...r, updated_at: now })), 500)) {
      const { error } = await T('daily_metrics').upsert(part, { onConflict: 'date,metric' });
      if (error) throw error;
    }

    let lastNight = null;
    if (sleep.length) {
      for (const part of chunk(sleep, 500)) {
        const { error } = await T('sleep_samples').upsert(part, { onConflict: 'start_at,end_at,stage', ignoreDuplicates: true });
        if (error) throw error;
      }
      // Recalculate every night touched by this batch from everything stored.
      const nights = [...new Set(sleep.map((s) => nightOf(new Date(s.end_at), TZ).key))].sort();
      const from = addDays(nights[0], -2) + 'T00:00:00Z';
      const to = addDays(nights[nights.length - 1], 1) + 'T00:00:00Z';
      const samples = [];
      for (let p = 0; ; p += 1000) {
        const { data, error } = await T('sleep_samples').select('start_at,end_at,stage')
          .gte('end_at', from).lt('end_at', to).order('end_at').range(p, p + 999);
        if (error) throw error;
        samples.push(...data);
        if (data.length < 1000) break;
      }
      const summary = summariseNights(samples, TZ).filter((r) => nights.includes(r.date));
      for (const part of chunk(summary.map((r) => ({ ...r, updated_at: now })), 500)) {
        const { error } = await T('daily_metrics').upsert(part, { onConflict: 'date,metric' });
        if (error) throw error;
      }
      const latest = summary.filter((r) => r.metric === 'sleep_min').sort((a, b) => b.date.localeCompare(a.date))[0];
      if (latest) lastNight = latest.value;
    }

    // ---- Heart-rate spikes ----
    let spikeCount = 0;
    if (hrSamples.length) {
      for (const part of chunk(hrSamples, 500)) {
        const { error } = await T('hr_samples').upsert(part, { onConflict: 'at', ignoreDuplicates: true });
        if (error) throw error;
      }
      // Ceiling = median resting HR over the last 28 days + 15 bpm.
      const since = addDays(localDate(new Date(), TZ), -28);
      const { data: rhrRows } = await T('daily_metrics').select('value').eq('metric', 'rhr').gte('date', since);
      const rhrVals = (rhrRows || []).map((r) => Number(r.value)).concat(rows.filter((r) => r.metric === 'rhr').map((r) => r.value));
      const rhr = median(rhrVals);
      if (rhr) {
        const ceiling = Math.round(rhr + 15);
        const dates = [...new Set(hrSamples.map((x) => localDate(new Date(x.at), TZ)))].sort();
        const from = new Date(new Date(dates[0] + 'T00:00:00Z').getTime() - 3 * 3600e3).toISOString();
        const to = new Date(new Date(addDays(dates[dates.length - 1], 1) + 'T00:00:00Z').getTime() + 3 * 3600e3).toISOString();
        const samples = [];
        for (let p = 0; ; p += 1000) {
          const { data, error } = await T('hr_samples').select('at,bpm').gte('at', from).lt('at', to).order('at').range(p, p + 999);
          if (error) throw error;
          samples.push(...data);
          if (data.length < 1000) break;
        }
        const runs = detectSpikes(samples, ceiling).filter((r) => dates.includes(localDate(new Date(r.start_at), TZ)));
        const { data: existing, error: exErr } = await T('hr_events').select('*').gte('start_at', from).lt('start_at', to);
        if (exErr) throw exErr;
        const keep = existing.filter((e) => e.tag || e.source === 'manual');
        const drop = existing.filter((e) => !e.tag && e.source !== 'manual').map((e) => e.id);
        if (drop.length) {
          const { error } = await T('hr_events').delete().in('id', drop);
          if (error) throw error;
        }
        const overlaps = (r, e) => new Date(r.start_at) <= new Date(new Date(e.end_at).getTime() + 5 * 60000)
          && new Date(r.end_at) >= new Date(new Date(e.start_at).getTime() - 5 * 60000);
        const fresh = runs.filter((r) => !keep.some((e) => e.source !== 'manual' && overlaps(r, e)));
        if (fresh.length) {
          const { error } = await T('hr_events').insert(fresh.map((r) => ({ ...r, source: 'auto', ceiling })));
          if (error) throw error;
        }
        // Manual watch tags made during a spike are attached to it.
        for (const m of keep.filter((e) => e.source === 'manual')) {
          const match = fresh.find((r) => overlaps(r, { start_at: new Date(new Date(m.start_at).getTime() - 25 * 60000).toISOString(), end_at: m.end_at }));
          if (match) {
            await T('hr_events').update({ tag: m.tag, tagged_at: m.tagged_at }).eq('start_at', match.start_at);
            await T('hr_events').delete().eq('id', m.id);
          }
        }
        const allRuns = runs; // includes tagged ones' time (approximately) for daily minutes
        const byDay = minutesByDay(allRuns, TZ);
        const minuteRows = dates.map((d) => ({ date: d, metric: 'hr_above_min', value: byDay[d] || 0, updated_at: now }));
        const { error: mErr } = await T('daily_metrics').upsert(minuteRows, { onConflict: 'date,metric' });
        if (mErr) throw mErr;
        spikeCount = runs.length;
      }
      // Keep the raw readings small: 45 days is plenty for spike detection.
      await T('hr_samples').delete().lt('at', new Date(Date.now() - 45 * 86400e3).toISOString());
    }
    const { data: pending } = await T('hr_events').select('id,start_at,end_at,peak,minutes')
      .is('tag', null).eq('source', 'auto').gte('end_at', new Date(Date.now() - 36 * 3600e3).toISOString())
      .order('start_at', { ascending: false }).limit(3);
    const untagged = (pending || []).map((e) => ({ id: e.id, label: eventLabel(e, TZ) }));

    const metrics = [...new Set(rows.map((r) => r.metric).concat(sleep.length ? ['sleep'] : []).concat(hrSamples.length ? ['hr samples'] : []))];
    await T('syncs').insert({ source: String(body.device || 'shortcut').slice(0, 40), lines: rows.length + sleep.length + hrSamples.length, metrics: metrics.join(',') });

    let message = `Synced ${rows.length + sleep.length} readings (${metrics.length} types).`;
    if (lastNight) message += ` Last night: ${fmtMinutes(lastNight)}.`;
    if (untagged.length) message += ` ${untagged.length} heart-rate ${untagged.length === 1 ? 'spike' : 'spikes'} to tag.`;
    if (invalid) message += ` ${invalid} lines skipped — check date format is ISO 8601.`;
    const received = { keys: Object.keys(body), chars: text.length, firstLine: text.split(/\r?\n/).find((l) => l.trim())?.slice(0, 120) || null };
    if (!text.trim()) message = 'Nothing received — the shortcut sent an empty list. Check the Combine Text step and that the JSON field is set to Combined Text.';
    res.status(200).json({ ok: true, message, received, saved: rows.length, sleepSamples: sleep.length, hrSamples: hrSamples.length, spikes: spikeCount, untagged, invalid, examplesInvalid });
  } catch (err) {
    fail(res, err);
  }
}
