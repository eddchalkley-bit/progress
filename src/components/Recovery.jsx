import { recoveryFor, recoveryLabel, FULL_BASELINE, balanceDays, balanceSummary, healthCheck, limitFor } from '../lib/recovery.js';

const signedPct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;
const signedNum = (v, unit) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))} ${unit}`;
// Position on the 60–140% recovery scale
const pos = (v) => `${Math.max(0, Math.min(100, ((v - 60) / 80) * 100))}%`;

export function RecoveryCard({ a }) {
  const days = a.days;
  const r = recoveryFor(days, days.length - 1);
  const hc = healthCheck(days);
  if (!r) {
    return (
      <section className="card recovery">
        <div className="card-head"><h3>Recovery</h3></div>
        <p className="rec-def">How recharged your body is this morning, compared with your normal.</p>
        <p className="muted small">Appears once Progress has three nights of HRV and resting heart rate to compare against.</p>
        <Glossary />
      </section>
    );
  }
  const limit = limitFor(r.score);
  const building = r.baselineDays < FULL_BASELINE;
  const rhrDiff = r.rhr - r.rhrAvg;
  return (
    <section className={`card recovery rec-${r.level}`}>
      <div className="card-head"><h3>Recovery</h3><span className={`t-pill ${r.level === 'good' ? 'good' : r.level === 'moderate' ? 'warn' : 'bad'}`}>{recoveryLabel(r.score)}</span></div>
      <p className="rec-def">How recharged your body is this morning, compared with your normal.</p>

      <div className="rec-score">{r.score}<span className="unit">%</span><span className="rec-of">of your normal</span></div>
      <div className="rec-scale" role="img" aria-label={`Recovery ${r.score}% of your normal`}>
        <div className="rec-band" />
        <div className="rec-normal" style={{ left: pos(100) }}><span>Your normal</span></div>
        <div className="rec-dot" style={{ left: pos(r.score) }} />
      </div>
      <div className="rec-ends"><span>Below</span><span>Above</span></div>

      <div className="rec-drivers">
        <div className={r.hrvPct <= -0.1 ? 'off' : r.hrvPct >= 0.1 ? 'good' : ''}>
          <span>HRV <small>↑ better</small></span>
          <strong>{Math.round(r.hrv)}<small> ms</small></strong>
          <em>{signedPct(r.hrvPct)} · normal {Math.round(r.hrvAvg)}</em>
        </div>
        <div className={r.rhrPct >= 0.04 ? 'off' : r.rhrPct <= -0.03 ? 'good' : ''}>
          <span>Resting HR <small>↓ better</small></span>
          <strong>{Math.round(r.rhr)}<small> bpm</small></strong>
          <em>{signedNum(rhrDiff, 'bpm')} · normal {Math.round(r.rhrAvg)}</em>
        </div>
      </div>
      <p className="rec-reason">{r.reason}</p>
      <p className="rec-limit"><b>Today:</b> aim for no more than about <b>{limit}%</b> of a usual day’s activity.</p>
      {building && <p className="muted small">Your normal is still being learned ({r.baselineDays} of {FULL_BASELINE} days), so expect these numbers to move around this week.</p>}
      <HealthRow hc={hc} />
      <Glossary />
    </section>
  );
}

function Glossary() {
  return (
    <details className="glossary">
      <summary>What do these mean?</summary>
      <dl>
        <dt>Your normal (baseline)</dt>
        <dd>Your own average over the last 60 days, for each signal. Everything in Progress is compared with this, not with population averages. It takes about two weeks to settle.</dd>
        <dt>Recovery</dt>
        <dd>This morning’s HRV and resting heart rate compared with your normal. 100% is a normal night. Below 100% means your body hasn’t fully recharged, often after a big day, poor sleep or illness.</dd>
        <dt>Activity limit</dt>
        <dd>Follows recovery: at 80% recovered, aim for about 80% of a usual day. It’s a ceiling, not a target.</dd>
        <dt>Energy budget (EU)</dt>
        <dd>The same idea in more detail: physical activity plus stress, with last night’s sleep and the last two days’ load taken into account.</dd>
      </dl>
    </details>
  );
}

function HealthRow({ hc }) {
  const shown = hc.rows.filter((x) => x.status !== 'nodata' && x.key !== 'hrv' && x.key !== 'rhr');
  if (!shown.length) return null;
  const mark = { normal: '✓', better: '+', off: '!', learning: '·' };
  return (
    <div className="health">
      <div className="health-chips">
        {shown.map((x) => (
          <div key={x.key} className={`hchip ${x.status}`}>
            <i>{mark[x.status]}</i>
            <span>{x.label}</span>
            <b>{x.delta && x.mean != null ? `${x.diff >= 0 ? '+' : '−'}${Math.abs(x.diff).toFixed(1)}` : x.fmt(x.value)}<small>{x.unit}</small></b>
          </div>
        ))}
      </div>
      <p className="muted small">Other overnight signals. {hc.summary}</p>
    </div>
  );
}

export function BalanceCard({ a }) {
  const rows = balanceDays(a.days, 7);
  if (!rows.some((r) => r.recovery != null)) return null;
  const sum = balanceSummary(rows);
  const basis = rows.find((r) => r.basis)?.basis === 'steps' ? 'steps' : 'active energy';
  return (
    <section className="card balance">
      <div className="card-head"><h3>Recovery vs activity</h3><span className={`bal-verdict ${sum.tone}`}>{sum.verdict}</span></div>
      <div className="bal-grid">
        {rows.map((r) => {
          const day = new Date(r.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2);
          return (
            <div key={r.date} className="bal-col">
              <span className={`bal-rec ${r.level || 'none'}`}>{r.recovery != null ? r.recovery : '–'}</span>
              <div className="bal-track">
                {r.exertion != null && <div className={`bal-fill ${r.over ? 'over' : ''} ${r.partial ? 'partial' : ''}`} style={{ height: `${Math.min(100, (r.exertion / 150) * 100)}%` }} />}
                {r.limit != null && <div className="bal-limit" style={{ bottom: `${(r.limit / 150) * 100}%` }} />}
              </div>
              <span className="bal-day">{r.partial ? 'Today' : day}</span>
            </div>
          );
        })}
      </div>
      <div className="bal-key muted small">
        <span><i className="k-rec" />Recovery (100 = normal)</span>
        <span><i className="k-bar" />Activity</span>
        <span><i className="k-lim" />That day’s limit</span>
      </div>
      <p>{sum.text}</p>
      <p className="muted small">Activity is your {basis} as a % of a usual day. Each day’s limit matches that morning’s recovery, so it drops after a poor night. Staying under the line is the aim. Today is so far.</p>
    </section>
  );
}
