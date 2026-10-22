const STATUS = {
  green: 'Within budget',
  amber: 'Near your limit',
  red: 'Crash-risk zone',
};

// Today's energy: used so far vs today's budget vs the predicted crash line.
// e = energyBudget(...) — worked out once in Today so the sleep card can show the same numbers.
export default function EnergyCard({ e, onLogCrash }) {

  if (!e.ready) {
    return (
      <section className="card energy">
        <div className="card-head"><h3>Today’s energy</h3></div>
        <p className="muted small">
          Your energy budget appears once Progress has about a week of Watch data
          {e.daysNeeded ? ` — roughly ${e.daysNeeded} more day${e.daysNeeded === 1 ? '' : 's'}` : ''}.
          Used so far today: {Math.round(e.today.total)} EU.
        </p>
      </section>
    );
  }

  const max = Math.max(e.crashLine, e.used, e.budget, 1) * 1.12;
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;
  const left = e.budget - e.used;

  const sentence =
    e.status === 'red'
      ? `You’re past your predicted crash line. Rest for the remainder of the day where you can.`
      : left >= 0
        ? `About ${left} EU left in today’s budget, and ${e.crashLine - e.used} before the crash line.`
        : `Over today’s budget — ${Math.max(0, e.crashLine - e.used)} EU before the crash line.`;

  return (
    <section className={`card energy energy-${e.status}`} aria-labelledby="energy-h">
      <div className="card-head">
        <h3 id="energy-h">Today’s energy</h3>
        <span className={`t-pill ${e.status === 'green' ? 'good' : e.status === 'amber' ? 'warn' : 'bad'}`}>{STATUS[e.status]}</span>
      </div>

      <div className="en-stats">
        <div><b>{e.used}</b><span>Used</span></div>
        <div><b>{e.budget}</b><span>Budget</span></div>
        <div className="en-crash"><b>{e.crashLine}</b><span>Crash line</span></div>
      </div>

      <div className="en-track" role="img" aria-label={`Used ${e.used} of a ${e.budget} EU budget; crash line ${e.crashLine}`}>
        <div className="en-zone amber" style={{ left: pct(e.amberLine), width: `calc(${pct(e.crashLine)} - ${pct(e.amberLine)})` }} />
        <div className="en-zone red" style={{ left: pct(e.crashLine) }} />
        <div className="en-fill" style={{ width: pct(e.used) }}>
          <div className="en-fill-stress" style={{ width: e.used ? `${(e.stress / e.used) * 100}%` : 0 }} />
        </div>
        {e.byNow != null && <div className="en-now" style={{ left: pct(e.byNow) }} />}
        <div className="en-mark budget" style={{ left: pct(e.budget) }}><span>Budget</span></div>
        <div className="en-mark crash" style={{ left: pct(e.crashLine) }}><span>Crash</span></div>
      </div>

      <p className="en-sentence">{sentence}</p>

      <div className="en-legend">
        <span><i className="sw-phys" />Physical {e.physical}</span>
        <span><i className="sw-stress" />Stress {e.stress}</span>
        {e.byNow != null && <span><i className="dot-now" />Even pace by now ~{e.byNow}</span>}
      </div>

      <p className="muted small en-foot">
        {e.carry > 0 && <>Budget is {e.carry} EU lower for load carried over from the last two days. </>}
        {e.potential < 1 && e.factor >= e.potential && <>Lowered to {Math.round(e.potential * 100)}% of your normal after last night. </>}
        {e.factor < 1 && e.factor < e.potential && <>Set to {Math.round(e.factor * 100)}% of your normal because of today’s status. </>}
        {e.potential > 1 && e.factor >= 1 && <>Last night lifted your potential to {e.potentialEU} EU, but the budget stays at your normal so you bank it. </>}
        {e.potential > 1 && e.factor < 1 && <>Last night helped, but today’s status still calls for a lighter day. </>}
        {e.learned
          ? `Crash line learned from your last ${e.crashesLogged} crashes.`
          : <>Crash line is an estimate until you’ve flagged {2 - e.crashesLogged} more crash{2 - e.crashesLogged === 1 ? '' : 'es'}. <button className="link-btn" onClick={onLogCrash}>Flag a crash</button></>}
      </p>
    </section>
  );
}
