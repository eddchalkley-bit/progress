import PageHeader from './PageHeader.jsx';
import { TargetLegend } from './Charts.jsx';
import { SleepInsights } from './SleepCard.jsx';
import { analyseSleep } from '../lib/sleep.js';
import { TargetCard } from './Today.jsx';
import { targetSpecs } from '../lib/targets.js';
import { progressBlocks } from '../lib/suggestions.js';
import { TriggersCard } from './Spikes.jsx';
import { useState } from 'react';
import { fmtMinutes, fmtDay } from '../lib/time.js';
import WhatWorked from './WhatWorked.jsx';
import { PRINCIPLES, SOURCES, RED_FLAGS, REVIEWED } from '../lib/research.js';
import { SYMPTOMS } from '../lib/analysis.js';

const fmt = (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-GB'));
const PILL = {
  strong: ['Consistent pattern', 'strong'],
  emerging: ['Early pattern', 'emerging'],
  none: ['No clear effect', 'none'],
  insufficient: ['Needs more data', 'none'],
};

function Research({ research, onReview, demo }) {
  const items = (research || []).filter((r) => !r.is_marker);
  const last = (research || [])[0]?.checked_at;
  return (
    <section className="card">
      <div className="card-head"><h3>Latest research</h3><span className="muted small">{last ? `checked ${fmtDay(last.slice(0, 10), { day: 'numeric', month: 'short' })}` : 'checked monthly'}</span></div>
      {items.length === 0 ? (
        <p className="muted small">{demo ? 'New studies on pacing and long COVID will appear here after the monthly check.' : 'Nothing new since the evidence base was reviewed. Progress checks on the 1st of each month.'}</p>
      ) : (
        <div className="research-list">
          {items.slice(0, 8).map((r) => (
            <article key={r.id} className={`research ${r.reviewed ? 'seen' : ''}`}>
              <div className="research-meta">{r.source}{r.published ? ` · ${r.published}` : ''}{!r.reviewed && <span className="pill new">New</span>}</div>
              <a href={r.url} target="_blank" rel="noreferrer"><strong>{r.title}</strong></a>
              <p>{r.summary}</p>
              {r.relevance && <p className="muted">{r.relevance}</p>}
              {r.suggests_change && <div className="tip"><b>May affect Progress:</b> {r.change} Thresholds stay as they are until you decide to update them.</div>}
              {!r.reviewed && <button className="link-btn" onClick={() => onReview(r.id)}>Mark as read</button>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProgressOverTime({ a }) {
  const blocks = progressBlocks(a);
  if (blocks.length < 2) return null;
  const rows = [
    { key: 'steady', label: 'Steady days', fmt: (v) => (v == null ? '–' : `${Math.round(v * 100)}%`), better: 'up' },
    { key: 'crashes', label: 'Crashes', fmt: (v) => `${v}`, better: 'down' },
    { key: 'symptom', label: 'Average symptoms', fmt: (v) => (v == null ? '–' : v.toFixed(1)), better: 'down' },
    { key: 'sleep', label: 'Average sleep', fmt: (v) => fmtMinutes(v), better: 'up' },
    { key: 'hrv', label: 'Average HRV', fmt: (v) => (v == null ? '–' : `${Math.round(v)} ms`), better: 'up' },
  ];
  const ordered = blocks; const last = ordered[ordered.length - 1], prev = ordered[ordered.length - 2];
  const dir = (r) => {
    const x = last[r.key], y = prev[r.key];
    if (x == null || y == null) return null;
    const d = x - y;
    const tol = { steady: 0.04, crashes: 0.5, symptom: 0.2, sleep: 10, hrv: 1.5 }[r.key];
    if (Math.abs(d) < tol) return 'same';
    return (d > 0) === (r.better === 'up') ? 'better' : 'worse';
  };
  return (
    <section className="card">
      <div className="card-head"><h3>Your progress</h3><span className="muted small">4-week blocks</span></div>
      <div className="pot-wrap">
        <table className="pot">
          <thead><tr><th />{blocks.map((b) => <th key={b.label}>{b.label}<span>{b.sub}</span></th>)}</tr></thead>
          <tbody>
            {rows.map((r) => {
              const d = dir(r);
              return (
                <tr key={r.key}>
                  <th>{r.label}</th>
                  {blocks.map((b, i) => (
                    <td key={b.label} className={i === blocks.length - 1 && d ? d : ''}>
                      {r.fmt(b[r.key])}{i === blocks.length - 1 && d && d !== 'same' && <span className="arrow">{d === 'better' ? ' ✓' : ' !'}</span>}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Each column is four weeks; “Now” is the most recent. Green with a tick means better than the four weeks before; amber means worse. Progress with long COVID is usually slow and uneven — steady days and fewer crashes matter more than doing more.</p>
    </section>
  );
}

function Evidence() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <div className="card-head"><h3>What the evidence says</h3><span className="muted small">reviewed {fmtDay(REVIEWED, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
      <div className="principles">
        {(open ? PRINCIPLES : PRINCIPLES.slice(0, 3)).map((p) => (
          <div key={p.id} className="principle">
            <strong>{p.title}</strong>
            <p>{p.body}</p>
            <div className="cites">{p.sources.map((k) => <a key={k} href={SOURCES[k].url} target="_blank" rel="noreferrer">{SOURCES[k].label}</a>)}</div>
          </div>
        ))}
      </div>
      {!open && <button className="link-btn" onClick={() => setOpen(true)}>Show all {PRINCIPLES.length}</button>}
      <h4>Get checked if you notice</h4>
      <ul className="plain">{RED_FLAGS.map((f) => <li key={f}>{f}</li>)}</ul>
    </section>
  );
}

export default function Insights({ a, research, onReview, demo }) {
  const b = a.baseline;
  const c = a.crashes;
  const groups = ['Activity', 'Daily load', 'Recovery habits', 'Body signals'];
  const enough = a.coverage.checkinDays >= 14;
  const specs = targetSpecs(a);
  const off = a.days.length - 30;
  const days30 = a.days.slice(-30).map((d, k) => ({ ...d, crash: a.crashes.flags[Math.max(0, off) + k] }));

  return (
    <div className="screen">
      <PageHeader eyebrow={`${a.coverage.days} days tracked · ${a.coverage.checkinDays} check-ins`} title="Insights" />

      <ProgressOverTime a={a} />

      <MorningEvening a={a} />

      <section className="card">
        <div className="card-head"><h3>Your baseline</h3><span className="muted small">last 28 days</span></div>
        <div className="kv-grid">
          <div><span>Symptom score</span><strong>{b.symptom == null ? '–' : b.symptom.toFixed(1)}<small>/10</small></strong></div>
          <div><span>Stable days</span><strong>{b.stablePct == null ? '–' : Math.round(b.stablePct * 100)}<small>%</small></strong></div>
          <div><span>Resting HR</span><strong>{fmt(b.rhr)}<small> bpm</small></strong></div>
          <div><span>HRV</span><strong>{fmt(b.hrv)}<small> ms</small></strong></div>
          <div><span>Sleep (usual / need)</span><strong>{fmtMinutes(b.sleep)}<small> / {fmtMinutes(analyseSleep(a).need)}</small></strong></div>
          <div><span>Sustainable steps</span><strong>{b.sustainableSteps ? `~${fmt(b.sustainableSteps)}` : '–'}</strong></div>
        </div>
        <p className="muted small">Stable days are days without a crash where symptoms stayed within a point of your usual level. Watching this rise is the clearest sign of progress.</p>
      </section>

      <div className="section-label">
        <h2>Last 30 days</h2>
        <p className="muted small">Red dots under each chart mark crash days.</p>
        <TargetLegend crash />
      </div>
      {specs.symptom && <TargetCard spec={specs.symptom} days={days30} crash />}
      {specs.steps && <TargetCard spec={specs.steps} days={days30.slice(0, -1)} title="Steps vs your envelope" crash />}
      <SleepInsights s={analyseSleep(a)} />

      <section className="card">
        <div className="card-head"><h3>What’s worked for you</h3></div>
        <WhatWorked a={a} level="amber" />
      </section>

      <TriggersCard events={a.events} today={a.today} />

      <section className="card">
        <div className="card-head"><h3>Crashes &amp; recovery</h3></div>
        {c.episodes.length === 0 ? (
          <p className="muted">No crashes detected yet. Mark a day as a crash in your check-in, or Progress will spot sharp rises in your symptom score.</p>
        ) : (
          <>
            <div className="kv-grid three">
              <div><span>Crashes</span><strong>{c.episodes.length}</strong></div>
              <div><span>Typical recovery</span><strong>{c.typicalRecovery ?? '–'}<small> days</small></strong></div>
              <div><span>Range</span><strong>{c.recoveryRange ? `${c.recoveryRange[0]}–${c.recoveryRange[1]}` : '–'}<small> days</small></strong></div>
            </div>
            {c.precursors.length > 0 && (
              <>
                <h4>In the 3 days before a crash</h4>
                <ul className="plain">
                  {c.precursors.slice(0, 4).map((p) => <li key={p.key}>{p.text}</li>)}
                </ul>
              </>
            )}
            <h4>Recent</h4>
            <ul className="episodes">
              {c.episodes.slice(-4).reverse().map((e) => (
                <li key={e.start}>
                  <span>{fmtDay(e.start)}</span>
                  <span className="muted">peak {e.peak}</span>
                  <strong>{e.ongoing ? `ongoing · day ${e.daysSoFar}` : `${e.recoveryDays} ${e.recoveryDays === 1 ? 'day' : 'days'} to recover`}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h3>What affects you</h3></div>
        {!enough && <p className="muted small">Patterns firm up after about two weeks of check-ins. You have {a.coverage.checkinDays}.</p>}
        {groups.map((g) => (
          <div key={g} className="factor-group">
            <h4>{g}</h4>
            {a.factors.filter((f) => f.group === g).map((f) => {
              const [label, cls] = PILL[f.strength];
              return (
                <div key={f.key} className="factor">
                  <div className="factor-top">
                    <strong>{f.label}</strong>
                    <span className={`pill ${cls} ${f.strength !== 'none' && f.strength !== 'insufficient' ? (f.worsens ? 'worse' : 'better') : ''}`}>{label}</span>
                  </div>
                  <p>{f.text}</p>
                </div>
              );
            })}
          </div>
        ))}
        <p className="muted small footnote">Activity is compared only from settled days, so rest during a crash doesn’t skew it. These are patterns in your own data, not diagnoses — worth sharing with your GP or long Covid clinic.</p>
      </section>

      <Evidence />
      <Research research={research} onReview={onReview} demo={demo} />
    </div>
  );
}

// How symptoms change from first thing to the end of the day, over the last 30 days.
function MorningEvening({ a }) {
  const both = a.days.slice(-30).filter((d) => d.morning != null && d.evening != null);
  const amOnly = a.days.slice(-30).filter((d) => d.morning != null).length;
  if (!amOnly) return null;
  const avg = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  if (both.length < 3) {
    return (
      <section className="card">
        <div className="card-head"><h3>Morning vs end of day</h3></div>
        <p className="muted small">Do both check-ins on a few days and this will show whether your symptoms are worse first thing or build up through the day. {both.length} of 3 days so far.</p>
      </section>
    );
  }
  const am = avg(both.map((d) => d.morning)), pm = avg(both.map((d) => d.evening));
  const worseEve = both.filter((d) => d.evening - d.morning >= 1).length;
  const worseAm = both.filter((d) => d.morning - d.evening >= 1).length;
  const per = SYMPTOMS.map((s) => {
    const pairs = both.map((d) => [d.checkin[`am_${s.key}`], d.checkin[s.key]]).filter(([x, y]) => x != null && y != null);
    return pairs.length ? { label: s.label, am: avg(pairs.map((p) => Number(p[0]))), pm: avg(pairs.map((p) => Number(p[1]))) } : null;
  }).filter(Boolean);
  const gap = pm - am;
  const headline = gap <= -0.7 ? 'Mornings are usually your hardest time' : gap >= 0.7 ? 'Symptoms usually build through the day' : 'Mornings and evenings are usually similar';
  return (
    <section className="card">
      <div className="card-head"><h3>Morning vs end of day</h3><span className="muted small">{both.length} days</span></div>
      <p><b>{headline}.</b> Morning average {am.toFixed(1)}, end of day {pm.toFixed(1)}. Worse by the evening on {worseEve} {worseEve === 1 ? 'day' : 'days'}, worse first thing on {worseAm}.</p>
      <div className="me-list">
        {per.map((r) => (
          <div key={r.label} className="me-row">
            <span>{r.label}</span>
            <div className="me-bars">
              <i className="me-am" style={{ width: `${r.am * 10}%` }} />
              <i className="me-pm" style={{ width: `${r.pm * 10}%` }} />
            </div>
            <b>{r.am.toFixed(1)} → {r.pm.toFixed(1)}</b>
          </div>
        ))}
      </div>
      <p className="muted small"><i className="me-key me-am" /> Morning <i className="me-key me-pm" /> End of day</p>
    </section>
  );
}
