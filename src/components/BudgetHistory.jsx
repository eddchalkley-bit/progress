import { afterOverDays } from '../lib/recovery.js';
import { limitSummary, crashAfter } from '../lib/dayLimits.js';

const weekday = (date, style = 'short') => new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: style });
const r100 = (n) => (Math.round(n / 100) * 100).toLocaleString('en-GB');

// The week behind today: what you did each day against that morning's budget, and how the day after went.
// Both in steps' worth, the same units as Today's energy.
export function BudgetWeekCard({ a, rows, reference }) {
  if (!rows || !rows.some((r) => r.limit != null)) return null;
  const sum = limitSummary(rows);
  const after = afterOverDays(a, rows).slice(-3);
  const MAX = reference * 1.5;
  return (
    <section className="card balance">
      <div className="card-head"><h3>Your last 7 days</h3><span className={`bal-verdict ${sum.tone}`}>{sum.verdict}</span></div>
      <p className="muted small bal-intro">Did you stay inside your budget? Each day’s budget is what that morning allowed, after the sleep you had and the two days before. A usual day is about {r100(reference)} steps’ worth.</p>

      <div className="bal-rows">
        {rows.map((r, i) => {
          const over = r.limit != null && r.did != null ? r.did - r.limit : null;
          return (
            <div key={r.date} className="bal-row" style={{ '--i': i }}>
              <span className="bal-day">{r.partial ? 'Today' : weekday(r.date)}</span>
              <div className="bal-htrack">
                {r.did != null && <div className={`bal-h-fill ${r.over ? 'over' : ''} ${r.partial ? 'partial' : ''}`} style={{ width: `${Math.min(100, (r.did / MAX) * 100)}%` }} />}
                {r.limit != null && <div className="bal-hlimit" style={{ left: `${Math.min(100, (r.limit / MAX) * 100)}%` }} />}
              </div>
              <span className="bal-val">
                <b>{r.did != null ? r100(r.did) : '–'}</b>
                <small className={r.over ? 'over' : ''}>
                  {r.limit == null ? 'no budget yet' : over > 0 ? `${r.over ? 'over' : 'just over'} by ${r100(over)}` : `budget ${r100(r.limit)}`}
                </small>
              </span>
            </div>
          );
        })}
      </div>

      <div className="bal-key muted small">
        <span><i className="k-bar" />What you did</span>
        <span><i className="k-lim" />Your budget</span>
        <span><i className="k-over" />Over</span>
      </div>

      <p>{sum.text}</p>

      {after.length > 0 && (
        <div className="bal-after">
          <span className="bal-after-k">What followed the over days</span>
          <ul>
            {after.map((x) => (
              <li key={x.date}>
                <b>{weekday(x.date)}</b> (over by {r100(x.by)}) →{' '}
                {x.delta == null ? `${weekday(x.nextDate)}: no check-in` : x.delta >= 0.3 ? `${weekday(x.nextDate)} symptoms ${x.delta.toFixed(1)} higher than usual` : x.delta <= -0.3 ? `${weekday(x.nextDate)} symptoms ${Math.abs(x.delta).toFixed(1)} lower than usual` : `${weekday(x.nextDate)} felt about as usual`}
                {x.crash ? ', crash flagged' : ''}
              </li>
            ))}
          </ul>
          <p className="muted small">Crashes can lag by a day or two, so a good next day doesn’t mean it was free.</p>
        </div>
      )}
      <p className="muted small">Figures are steps’ worth: your steps plus other movement, stress and mental effort. “Just over” is within 10% of a usual day and doesn’t count as over. Today’s row includes today’s status too.</p>
    </section>
  );
}

// 30 days: each bar is what you did, the tick is that morning's budget. Amber = over. Red dot = crash.
export function BudgetMonthCard({ a, rows, reference }) {
  if (!rows || !rows.some((r) => r.limit != null)) return null;
  const sum = limitSummary(rows);
  const ca = crashAfter(a, rows);
  const MAX = Math.max(reference * 1.5, ...rows.map((r) => r.did ?? 0), ...rows.map((r) => r.limit ?? 0)) * 1.05;
  const pct = (v) => `${Math.min(100, (v / MAX) * 100)}%`;
  const first = rows[0], last = rows[rows.length - 1];
  const fmtD = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <section className="card">
      <div className="card-head"><h3>Your budget, day by day</h3><span className={`bal-verdict ${sum.tone}`}>{sum.verdict}</span></div>
      <div className="bm-chart" role="img" aria-label={`Last ${rows.length} days: what you did against each morning’s budget. Over budget on ${sum.over} of ${sum.total} days.`}>
        {rows.map((r) => (
          <div key={r.date} className="bm-col">
            <div className="bm-track">
              {r.did != null && <div className={`bm-bar ${r.over ? 'over' : ''} ${r.partial ? 'partial' : ''}`} style={{ height: pct(r.did) }} />}
              {r.limit != null && <div className="bm-tick" style={{ bottom: pct(r.limit) }} />}
            </div>
            <i className={`bm-dot ${r.crash ? 'on' : ''}`} />
          </div>
        ))}
      </div>
      <div className="bm-axis muted small"><span>{fmtD(first.date)}</span><span>Today</span></div>
      <div className="bal-key muted small">
        <span><i className="k-bar" />What you did</span>
        <span><i className="k-lim" />That morning’s budget</span>
        <span><i className="k-over" />Over</span>
        <span><i className="k-crash" />Crash</span>
      </div>
      <p>{sum.text}</p>
      {ca.over.n > 0 && ca.ok.n > 0 && (
        <p>A crash followed <b>{ca.over.crash} of {ca.over.n}</b> over-budget days, and <b>{ca.ok.crash} of {ca.ok.n}</b> days within budget.</p>
      )}
      <p className="muted small">Same budget as Today’s energy, in steps’ worth. It comes from your sleep and the two days before each morning. Patterns in your own data, not proof of cause.</p>
    </section>
  );
}
