import { fmtMinutes, fmtClock } from '../lib/time.js';

// Today: a nap picked up from Apple Health, what it did to today's energy, and what it means for tonight.
export default function NapCard({ s, energy }) {
  const n = s.nap;
  const T = n.today;
  if (!T) return null;
  const pct = Math.round(s.potential * 100);
  const before = Math.round(s.potentialNight * 100);
  const lifted = s.napLift > 0;
  const shortfall = s.potentialNight < 1;

  let impact;
  if (lifted) {
    impact = `Wins back part of last night’s shortfall: today’s potential goes from ${before}% to ${pct}% of your normal. It never rises above normal.`;
  } else if (shortfall && n.verdict === 'hurts') {
    impact = 'In your own data, naps haven’t helped the next day, so Progress isn’t counting this one towards today’s budget.';
  } else if (!shortfall) {
    impact = 'Last night was enough, so this nap is rest, not extra budget to spend.';
  } else {
    impact = 'Too short to change today’s budget. Rest still counts towards recovery.';
  }

  const rest = energy?.ready ? energy.rest : 0;
  const evidence = n.effects.filter((e) => ['sym', 'short', 'bed', 'length', 'time'].includes(e.key)).slice(0, 2);

  return (
    <section className="card sleep nap" aria-labelledby="nap-h">
      <div className="card-head">
        <h3 id="nap-h">Today’s nap</h3>
        <span className={`t-pill ${T.long || T.late ? 'warn' : 'good'}`}>{T.count > 1 ? `${T.count} naps` : T.long ? 'Long' : T.late ? 'Late' : 'Short'}</span>
      </div>

      <div className="sl-hero">
        <div className="sl-big">{fmtMinutes(T.min)}</div>
        <div className="sl-sub">
          asleep{T.start != null && T.end != null ? <> · {fmtClock(T.start)}–{fmtClock(T.end)}</> : null}
        </div>
      </div>

      <div className={`sl-impact ${lifted ? 'up' : ''}`}>
        <div>
          <span className="sl-impact-k">Effect on today’s energy</span>
          <span className="sl-impact-v">{lifted ? `+${s.napLift}%` : '±0%'}</span>
        </div>
        <p>{impact}</p>
      </div>

      <div className={`sl-impact ${rest > 0 ? 'up' : ''}`}>
        <div>
          <span className="sl-impact-k">Counts as rest</span>
          <span className="sl-impact-v">{rest > 0 ? `−${rest} EU` : '0 EU'}</span>
        </div>
        <p>{rest > 0
          ? 'Taken off what you’ve used today, and carried into tomorrow like any other load. Rest lowers your load; it doesn’t raise your budget.'
          : n.verdict === 'hurts' ? 'Not counted: in your own data, naps haven’t helped the next day.'
            : energy?.ready ? 'Too short to count as rest.' : 'Your energy budget appears once Progress has about a week of data.'}</p>
      </div>

      {n.tonight && (
        <div className={`sl-impact ${n.tonight.level === 'watch' ? 'down' : ''}`}>
          <div><span className="sl-impact-k">Tonight</span></div>
          <p>{n.tonight.text}</p>
        </div>
      )}

      {evidence.length > 0 && (
        <ul className="sl-coach">{evidence.map((e) => <li key={e.key}>{e.text}</li>)}</ul>
      )}

      <p className="muted small sl-foot">
        {n.learned
          ? `Learned from ${n.napDays} of your nap days. ${n.confidence}, not proof of cause.`
          : `Using a cautious default until Progress has seen ${Math.max(0, 8 - n.napDays)} more nap days to learn how naps affect you.`}
      </p>
    </section>
  );
}

// Insights: what Progress has learned about your naps.
export function NapInsights({ s }) {
  const n = s.nap;
  if (!n || n.napDays === 0) return null;
  return (
    <section className="card sleep">
      <div className="card-head"><h3>Your naps</h3><span className="muted small">{n.learned ? n.confidence.toLowerCase() : 'learning'} · {n.napDays} nap {n.napDays === 1 ? 'day' : 'days'}</span></div>
      <div className="kv-grid">
        <div><span>Naps per week</span><strong>{n.usual.perWeek}</strong></div>
        <div><span>Usual length</span><strong>{n.usual.min != null ? fmtMinutes(n.usual.min) : '–'}</strong></div>
        <div><span>Usual start</span><strong>{n.usual.start != null ? fmtClock(n.usual.start) : '–'}</strong></div>
      </div>
      {n.effects.length > 0 ? (
        <ul className="sl-coach">{n.effects.map((e) => <li key={e.key}>{e.text}</li>)}</ul>
      ) : (
        <p className="muted small">Progress needs at least 5 days with a nap and 5 without, plus the nights and check-ins after them, before it can say how naps affect you.</p>
      )}
      <p className="muted small">Naps usually happen on harder days, so these compare the day <i>after</i> a nap. They’re patterns in your own data, not proof of cause.</p>
    </section>
  );
}
