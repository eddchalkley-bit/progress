import { recoveryFor, LEVEL_LABEL, FULL_BASELINE, balanceDays, balanceSummary, healthCheck, limitFor } from '../lib/recovery.js';

const pct = (v) => `${v > 0 ? '↑' : '↓'} ${Math.abs(Math.round(v * 100))}%`;

export function RecoveryCard({ a }) {
  const days = a.days;
  const r = recoveryFor(days, days.length - 1);
  const hc = healthCheck(days);
  if (!r) {
    return (
      <section className="card recovery">
        <div className="card-head"><h3>Recovery</h3></div>
        <p className="muted small">Your recovery score appears once Progress has three nights of HRV and resting heart rate to compare against.</p>
      </section>
    );
  }
  const limit = limitFor(r.score);
  return (
    <section className={`card recovery rec-${r.level}`}>
      <div className="card-head"><h3>Recovery</h3><span className="muted small">{LEVEL_LABEL[r.level]}</span></div>
      <div className="rec-score">{r.score}<span className="unit">%</span></div>
      <div className="rec-bar"><div style={{ width: `${r.score}%` }} /></div>
      <div className="rec-drivers">
        <div className={r.hrvPct <= -0.1 ? 'off' : r.hrvPct >= 0.1 ? 'good' : ''}>
          <span>HRV</span><strong>{Math.round(r.hrv)}<small> ms</small></strong>
          <em>{pct(r.hrvPct)} · avg {Math.round(r.hrvAvg)}</em>
        </div>
        <div className={r.rhrPct >= 0.04 ? 'off' : r.rhrPct <= -0.03 ? 'good' : ''}>
          <span>Resting HR</span><strong>{Math.round(r.rhr)}<small> bpm</small></strong>
          <em>{pct(r.rhrPct)} · avg {Math.round(r.rhrAvg)}</em>
        </div>
      </div>
      <p>{r.reason}</p>
      <p className="muted small">Today’s activity limit: {limit} on the exertion scale (50 = a usual day).{r.baselineDays < FULL_BASELINE ? ` Sharpens as your baseline builds — ${r.baselineDays} of ${FULL_BASELINE} days.` : ''}</p>
      <HealthRow hc={hc} />
    </section>
  );
}

function HealthRow({ hc }) {
  const shown = hc.rows.filter((x) => x.status !== 'nodata');
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
      <p className="muted small">{hc.summary}</p>
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
                {r.exertion != null && <div className={`bal-fill ${r.over ? 'over' : ''} ${r.partial ? 'partial' : ''}`} style={{ height: `${r.exertion}%` }} />}
                {r.limit != null && <div className="bal-limit" style={{ bottom: `${r.limit}%` }} />}
              </div>
              <span className="bal-day">{r.partial ? 'Today' : day}</span>
            </div>
          );
        })}
      </div>
      <div className="bal-key muted small">
        <span><i className="k-rec" />Recovery %</span>
        <span><i className="k-bar" />Activity</span>
        <span><i className="k-lim" />Your limit</span>
      </div>
      <p>{sum.total > 0 && <b>Over your limit {sum.over} of {sum.total} days. </b>}{sum.text}</p>
      <p className="muted small">Activity is your {basis} compared with a usual day. The limit drops on low-recovery days; staying under it is the aim. Today is so far.</p>
    </section>
  );
}
