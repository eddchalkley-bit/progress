const STATUS = {
  green: 'Within budget',
  amber: 'Near your limit',
  red: 'Crash-risk zone',
};

const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const hhmm = (h) => `${String(h).padStart(2, '0')}:00`;

// Today's energy in plain terms: what you have, what you've used, and a rough pace for the rest of the day.
// e = energyBudget(...) — worked out once in Today so the sleep card shows the same numbers.
// Units are turned into "steps' worth" using today's step budget, so this card and the Steps tile agree.
export default function EnergyCard({ e, onLogCrash, now = new Date() }) {
  if (!e.ready) {
    return (
      <section className="card energy">
        <div className="card-head"><h3>Today’s energy</h3></div>
        <p className="muted small">
          Your energy budget appears once Progress has about a week of Watch data
          {e.daysNeeded ? ` — roughly ${e.daysNeeded} more day${e.daysNeeded === 1 ? '' : 's'}` : ''}.
          Used so far today: {Math.round(e.today.total)} units.
        </p>
      </section>
    );
  }

  const k = e.stepsPerUnit;                                    // steps' worth per energy unit, or null
  const show = (units) => (k ? fmt(Math.round((units * k) / 100) * 100) : fmt(units));
  const unitWord = k ? 'steps’ worth' : 'energy units';

  const left = e.budget - e.used;
  const max = Math.max(e.crashLine, e.used, e.budget, 1) * 1.12;
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;

  // Rough pace: an even spread from 07:00 to 21:00, the same rule as the Steps tile.
  const h = now.getHours() + now.getMinutes() / 60;
  const marks = [10, 12, 15, 18].filter((hr) => hr > h + 0.5).slice(0, 3)
    .map((hr) => ({ hr, units: e.budget * ((hr - 7) / 14) }));
  let paceLine = null;
  if (e.byNow != null) {
    const gap = e.byNow - e.used;
    paceLine = e.status === 'red' ? 'You’re past your crash line. Rest for the rest of the day where you can.'
      : e.used > e.budget ? 'You’re over today’s budget. Rest where you can.'
      : gap > e.budget * 0.15 ? `Well under an even pace, so you have room. Spread it out rather than saving it all for later.`
      : gap >= -e.budget * 0.1 ? 'Right on an even pace. Keep resting between things.'
      : 'Ahead of an even pace. A rest now will help.';
  }

  const headline = e.status === 'red' ? 'Rest for the rest of the day'
    : e.used > e.budget ? 'Over today’s budget'
    : `${show(left)}`;

  return (
    <section className={`card energy energy-${e.status}`} aria-labelledby="energy-h">
      <div className="card-head">
        <h3 id="energy-h">Today’s energy</h3>
        <span className={`t-pill ${e.status === 'green' ? 'good' : e.status === 'amber' ? 'warn' : 'bad'}`}>{STATUS[e.status]}</span>
      </div>

      <div className="en-hero">
        <div className="en-big">{headline}</div>
        {e.status !== 'red' && e.used <= e.budget && <div className="en-cap">{unitWord} left in today’s budget</div>}
      </div>

      <div className="en-track" role="img" aria-label={`Used ${show(e.used)} of a ${show(e.budget)} ${unitWord} budget; crash line ${show(e.crashLine)}`}>
        <div className="en-zone amber" style={{ left: pct(e.amberLine), width: `calc(${pct(e.crashLine)} - ${pct(e.amberLine)})` }} />
        <div className="en-zone red" style={{ left: pct(e.crashLine) }} />
        <div className="en-fill" style={{ width: pct(e.used) }}>
          <div className="en-fill-stress" style={{ width: e.used ? `${(e.stress / e.used) * 100}%` : 0 }} />
        </div>
        {e.byNow != null && <div className="en-now" style={{ left: pct(e.byNow) }} />}
        <div className="en-mark budget" style={{ left: pct(e.budget) }}><span>Budget</span></div>
        <div className="en-mark crash" style={{ left: pct(e.crashLine) }}><span>Crash</span></div>
      </div>

      <div className="en-labels">
        <div><b>{show(e.used)}</b><span>Used so far</span></div>
        <div><b>{show(e.budget)}</b><span>Today’s budget</span></div>
        <div className="en-crash"><b>{show(e.crashLine)}</b><span>Crash line</span></div>
      </div>

      {(paceLine || marks.length > 0) && (
        <div className="en-guide">
          <span className="en-guide-k">A pace for the day</span>
          {paceLine && <p>{paceLine}</p>}
          {marks.length > 0 && (
            <div className="en-chips" aria-label="Rough guide to how much to have used by each time">
              {marks.map((m) => <span key={m.hr}><small>by {hhmm(m.hr)}</small><b>{show(m.units)}</b></span>)}
            </div>
          )}
        </div>
      )}

      <p className="muted small en-foot">
        {k ? 'Steps’ worth is a guide: your budget also counts other movement, stress and mental effort. ' : ''}
        {e.carry > 0 && <>Today’s budget is {show(e.carry)} lower because the last two days were busy. </>}
        {e.potential < 1 && e.factor >= e.potential && <>It’s also lower after a short night{e.napLift > 0 ? ' (your nap won some back)' : ''}. </>}
        {e.factor < 1 && e.factor < e.potential && <>It’s set lower because of today’s status. </>}
        {e.rest > 0 && <>Your nap counts as rest, taking {show(e.rest)} off what you’ve used. </>}
        {e.learned
          ? `The crash line is learned from your last ${e.crashesLogged} crashes.`
          : <>The crash line is an estimate until you’ve flagged {2 - e.crashesLogged} more crash{2 - e.crashesLogged === 1 ? '' : 'es'}. <button className="link-btn" onClick={onLogCrash}>Flag a crash</button></>}
      </p>
    </section>
  );
}
