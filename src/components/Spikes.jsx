import { useState } from 'react';
import { TAGS, TAG_BY_ID, triggerSummary } from '../lib/spikes.js';
import { localDate, addDays } from '../lib/time.js';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
// If a spike happened while the phone or laptop was in use, suggest Screens.
function screenHint(e, sessions) {
  const s0 = new Date(e.start_at).getTime(), e0 = new Date(e.end_at).getTime();
  return (sessions || []).some((s) => {
    const a = new Date(s.start_at).getTime(), b = s.end_at ? new Date(s.end_at).getTime() : Date.now();
    return a <= e0 && b >= s0;
  }) ? 'screens' : null;
}

const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function SpikeRow({ e, onTag, hint }) {
  const [editing, setEditing] = useState(!e.tag);
  const [busy, setBusy] = useState(false);
  const choose = async (id) => {
    setBusy(true);
    try { await onTag(e.id, id); setEditing(false); } finally { setBusy(false); }
  };
  return (
    <li className={`spike ${e.tag ? 'tagged' : ''}`}>
      <div className="spike-top">
        <div>
          <strong>{hhmm(e.start_at)}–{hhmm(e.end_at)}</strong>
          <span className="muted small"> · {e.minutes} min · peak {e.peak} bpm</span>
        </div>
        {e.tag && !editing && (
          <button className="spike-tag" onClick={() => setEditing(true)} aria-label="Change tag">{TAG_BY_ID[e.tag]?.label || e.tag}</button>
        )}
      </div>
      {editing && (
        <div className="tag-chips" role="group" aria-label="What was it?">
          {TAGS.map((t) => (
            <button key={t.id} disabled={busy} className={e.tag === t.id ? 'on' : hint === t.id ? 'hint' : ''} onClick={() => choose(t.id)}>{t.label}{hint === t.id && !e.tag ? ' ?' : ''}</button>
          ))}
        </div>
      )}
    </li>
  );
}

// Today: spikes from today plus any untagged from yesterday.
export function SpikesCard({ events, sessions, today, aboveToday, ceiling, onTag }) {
  const yday = addDays(today, -1);
  const list = (events || []).filter((e) => e.source !== 'manual' && (
    localDate(new Date(e.start_at), TZ) === today || (!e.tag && localDate(new Date(e.start_at), TZ) === yday)
  )).sort((a, b) => b.start_at.localeCompare(a.start_at));
  const untagged = list.filter((e) => !e.tag).length;
  return (
    <section className="card spikes-card">
      <div className="card-head">
        <h3>Heart-rate spikes</h3>
        {untagged > 0 && <span className="pill new">{untagged} to tag</span>}
      </div>
      <p className="muted small">
        {aboveToday != null ? `${Math.round(aboveToday)} min above your ceiling${ceiling ? ` (${ceiling} bpm)` : ''} today. ` : ''}
        Tap what each one was — Progress learns your triggers from this.
      </p>
      {list.length === 0 ? (
        <p className="muted small">No spikes yet today.</p>
      ) : (
        <ul className="spike-list">{list.map((e) => <SpikeRow key={e.id} e={e} onTag={onTag} hint={screenHint(e, sessions)} />)}</ul>
      )}
    </section>
  );
}

// Insights: what raises your heart rate, last 30 days.
export function TriggersCard({ events, today }) {
  const from = addDays(today, -29);
  const s = triggerSummary(events, from, TZ);
  if (!s.total) {
    return (
      <section className="card">
        <div className="card-head"><h3>What raises your heart rate</h3></div>
        <p className="muted small">Once heart-rate readings are syncing, spikes you tag will build up a picture of your triggers here.</p>
      </section>
    );
  }
  const max = Math.max(1, ...s.list.map((r) => r.minutes));
  const top = s.list.find((r) => TAG_BY_ID[r.tag]?.idea);
  const tagged = s.total - s.untagged;
  return (
    <section className="card">
      <div className="card-head"><h3>What raises your heart rate</h3><span className="muted small">last 30 days</span></div>
      <p className="muted small">{s.total} spikes, {Math.round(s.totalMin)} min above your ceiling. {tagged} tagged{s.untagged ? `, ${s.untagged} still to tag` : ''}.</p>
      <div className="trig-list">
        {s.list.map((r) => (
          <div key={r.tag} className="trig">
            <div className="trig-top">
              <span>{TAG_BY_ID[r.tag]?.label || r.tag}</span>
              <span className="muted small">{r.count}× · {Math.round(r.minutes)} min · avg peak {r.avgPeak}</span>
            </div>
            <div className="trig-bar"><div style={{ width: `${(r.minutes / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      {top && tagged >= 3 && (
        <div className="tip"><b>{TAG_BY_ID[top.tag].label} is your biggest trigger.</b> {TAG_BY_ID[top.tag].idea}</div>
      )}
    </section>
  );
}
