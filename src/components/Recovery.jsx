import { sleepPotentialAt } from '../lib/sleep.js';
import { afterOverDays, recoveryFor, recoveryLabel, FULL_BASELINE, balanceDays, balanceSummary, healthCheck, limitFor } from '../lib/recovery.js';

const signedPct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`;
const signedNum = (v, unit) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v))} ${unit}`;
// Position on the 60–140% recovery scale
const pos = (v) => `${Math.max(0, Math.min(100, ((v - 60) / 80) * 100))}%`;

export function RecoveryCard({ a, sleep }) {
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
  // Body signals alone can look fine after a short night. Today's ceiling is the lower of that and the
  // sleep-adjusted figure (last night's sleep, sleep debt and body signals), the same one Today's energy uses.
  const bodyLimit = limitFor(r.score);
  const sleepLimit = sleep?.potential != null ? Math.round(sleep.potential * 100) : null;
  const capped = sleepLimit != null && sleepLimit < bodyLimit;
  const limit = capped ? sleepLimit : bodyLimit;
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
      <p className="rec-limit"><b>Today:</b> aim for no more than about <b>{limit}%</b> of a usual day’s activity.{capped && <span className="muted small"> Your body signals say {bodyLimit}%, but last night’s sleep holds it down{sleep.napLift > 0 ? ' (your nap has already won some back)' : ''}.</span>}</p>
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
        <dd>Follows recovery, held down further by a short night: at 80% recovered, aim for about 80% of a usual day. It’s a ceiling, not a target.</dd>
        <dt>Energy budget</dt>
        <dd>What you can safely do today, shown as “steps’ worth”. It counts physical activity plus stress, and is lowered after a short night or two busy days. Naps count as rest.</dd>
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

const weekday = (date, style = 'short') => new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: style });

// The week behind today: what you did each day against that day's limit, and how the day after went.
// (Today's live numbers are in Today's energy; this morning's limit is in Recovery.)
export function BalanceCard({ a }) {
  const rows = balanceDays(a.days, 7, (i) => sleepPotentialAt(a, i));
  if (!rows.some((r) => r.recovery != null)) return null;
  const sum = balanceSummary(rows);
  const after = afterOverDays(a, rows).slice(-3);
  const basis = rows.find((r) => r.basis)?.basis === 'steps' ? 'steps' : 'physical effort';
  const MAX = 150;
  return (
    <section className="card balance">
      <div className="card-head"><h3>Your last 7 days</h3><span className={`bal-verdict ${sum.tone}`}>{sum.verdict}</span></div>
      <p className="muted small bal-intro">Did you stay under your limit? Your limit is how much you can safely do that day, set by the morning’s recovery and the night’s sleep. 100 means a usual day.</p>

      <div className="bal-rows">
        {rows.map((r, i) => {
          const did = r.exertion != null ? Math.round(r.exertion) : null;
          const over = r.limit != null && did != null ? did - r.limit : null;
          return (
            <div key={r.date} className="bal-row" style={{ '--i': i }}>
              <span className="bal-day">{r.partial ? 'Today' : weekday(r.date)}</span>
              <div className="bal-htrack">
                {did != null && <div className={`bal-h-fill ${r.over ? 'over' : ''} ${r.partial ? 'partial' : ''}`} style={{ width: `${Math.min(100, (did / MAX) * 100)}%` }} />}
                {r.limit != null && <div className="bal-hlimit" style={{ left: `${(r.limit / MAX) * 100}%` }} />}
              </div>
              <span className="bal-val">
                <b>{did != null ? `${did}%` : '–'}</b>
                <small className={r.over ? 'over' : ''}>
                  {r.limit == null ? 'no limit yet' : over > 0 ? `${r.over ? 'over' : 'just over'} by ${over}` : `limit ${r.limit}`}
                </small>
              </span>
            </div>
          );
        })}
      </div>

      <div className="bal-key muted small">
        <span><i className="k-bar" />What you did</span>
        <span><i className="k-lim" />Your limit</span>
        <span><i className="k-over" />Over</span>
      </div>

      <p>{sum.text}</p>

      {after.length > 0 && (
        <div className="bal-after">
          <span className="bal-after-k">What followed the over days</span>
          <ul>
            {after.map((x) => (
              <li key={x.date}>
                <b>{weekday(x.date)}</b> (over by {x.by}) →{' '}
                {x.delta == null ? `${weekday(x.nextDate)}: no check-in` : x.delta >= 0.3 ? `${weekday(x.nextDate)} symptoms ${x.delta.toFixed(1)} higher than usual` : x.delta <= -0.3 ? `${weekday(x.nextDate)} symptoms ${Math.abs(x.delta).toFixed(1)} lower than usual` : `${weekday(x.nextDate)} felt about as usual`}
                {x.crash ? ', crash flagged' : ''}
              </li>
            ))}
          </ul>
          <p className="muted small">Crashes can lag by a day or two, so a good next day doesn’t mean it was free.</p>
        </div>
      )}

      <p className="muted small">Bars are your {basis} as a % of a usual day; “just over” is within 10 points, which doesn’t count as over. Today’s limit and live budget are in the cards above. This one is the week behind them.</p>
    </section>
  );
}
