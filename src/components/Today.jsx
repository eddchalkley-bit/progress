import { TargetChart, TargetLegend, windowSummary } from './Charts.jsx';
import { targetSpecs, statusOf, describe } from '../lib/targets.js';
import { fmtMinutes } from '../lib/time.js';
import WhatWorked from './WhatWorked.jsx';
import { Logo } from './Logo.jsx';
import { dayPlan, noticings } from '../lib/suggestions.js';
import { SpikesCard } from './Spikes.jsx';
import { fmtHM } from '../lib/screens.js';

const fmt = (v) => (v == null ? '–' : Math.round(v).toLocaleString('en-GB'));

function since(iso) {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function TargetCard({ spec, days, title, crash = false }) {
  const series = days.map((d) => ({ date: d.date, value: d[spec.key] ?? null, crash: crash && d.crash }));
  let latest = null;
  for (let i = series.length - 1; i >= 0; i--) if (series[i].value != null) { latest = series[i]; break; }
  const st = statusOf(latest?.value, spec);
  const c = windowSummary(series, spec);
  const off = c.warn + c.bad;
  return (
    <section className="card tcard">
      <div className="tcard-head">
        <div>
          <h3>{title || spec.label}</h3>
          <div className="tcard-value">{latest ? spec.fmt(latest.value) : '–'}<span className="unit">{spec.unit}</span></div>
        </div>
        {st && <span className={`t-pill ${st}`}>{describe(latest.value, spec)}</span>}
      </div>
      <TargetChart series={series} spec={spec} />
      <p className="tcard-sum">Last {series.length} days: <b>{c.on + c.good}</b> on or better than target, <b className={off ? 'off' : ''}>{off}</b> off target.</p>
      <p className="muted small">{spec.note}</p>
    </section>
  );
}

export default function Today({ a, data, onCheckIn, onRefresh, loading, onTag }) {
  const days = a.days;
  const t = days[days.length - 1];
  const y = days[days.length - 2];
  const last14 = days.slice(-14);
  const specs = targetSpecs(a);
  const b = a.baseline;
  const s = a.status;
  const env = a.envelope.steps;
  const lastSync = data?.syncs?.[0]?.at;


  const plan = dayPlan(a);
  const notes = noticings(a);
  const planMax = plan.budget ? Math.max(plan.budget, plan.steps) * 1.1 : 1;

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const checkedIn = Boolean(t.checkin);

  return (
    <div className="screen">
      <header className="brand-row">
        <Logo />
        <button className="sync" onClick={onRefresh} disabled={loading}>
          <span className={`dot ${lastSync && Date.now() - new Date(lastSync) < 18 * 3600e3 ? 'fresh' : 'stale'}`} />
          {loading ? 'Refreshing…' : `Synced ${since(lastSync)}`}
        </button>
      </header>
      <div className="greeting">
        <h1>{greeting()}</h1>
        <div className="eyebrow">{dateLabel}</div>
      </div>

      {plan.recovery.active ? (
        <section className="status status-recovery">
          <div className="status-kicker">Recovery mode</div>
          <h2>{plan.recovery.justRecovered ? 'Coming back gently' : `Crash day ${plan.recovery.day}`}</h2>
          <p>{plan.recovery.typical && !plan.recovery.justRecovered ? `Your crashes have usually settled in about ${plan.recovery.typical} days. Rest is the treatment — it isn’t lost time.` : 'Go slowly for the next few days, even if you feel ready for more.'}</p>
          <ol className="phases">
            {plan.recovery.phases.map((ph) => (
              <li key={ph.id} className={ph.id === plan.recovery.phase ? 'now' : ''}>
                <strong>{ph.title}</strong>
                {ph.id === plan.recovery.phase && ph.text && <span>{ph.text}</span>}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section className={`status status-${s.level}`}>
          <div className="status-kicker">{s.level === 'building' ? 'Getting started' : 'Today'}</div>
          <h2>{s.title}</h2>
          <p>{s.advice}</p>
          {s.reasons.length > 0 && (
            <ul className="reasons">
              {s.reasons.map((r, i) => <li key={i} className={r.level}>{r.text}</li>)}
            </ul>
          )}
        </section>
      )}

      {a.redFlag && <div className="flag-banner">{a.redFlag}</div>}

      <section className="card plan">
        <div className="card-head">
          <h3>Today’s plan</h3>
          {plan.budget && plan.factor < 1 && <span className="muted small">{Math.round(plan.factor * 100)}% of your {plan.envReady ? 'envelope' : 'usual'}</span>}
        </div>
        {plan.budget ? (
          <>
            <div className="big">{fmt(plan.steps)}<span className="unit"> / ~{fmt(plan.budget)} steps</span></div>
            <div className="env-bar" role="img" aria-label={`${fmt(plan.steps)} of about ${fmt(plan.budget)} steps`}>
              <div className={`env-fill ${plan.steps > plan.budget ? 'over' : ''}`} style={{ width: `${Math.min(100, (plan.steps / planMax) * 100)}%` }} />
              {plan.hourFrac > 0.05 && plan.hourFrac < 1 && <div className="env-now" style={{ left: `${(plan.byNow / planMax) * 100}%` }} title="Even pace by now" />}
              <div className="env-mark safe" style={{ left: `${(plan.budget / planMax) * 100}%` }} />
            </div>
            <div className="plan-scale">
              {plan.hourFrac > 0.05 && plan.hourFrac < 1 ? <span><i className="dot-now" />Even pace by now: ~{fmt(plan.byNow)}</span> : <span />}
              <span><i className="dot-limit" />Today’s budget</span>
            </div>
            {plan.pace && <p className={`pace ${plan.pace.tone}`}>{plan.pace.text}</p>}
          </>
        ) : (
          <>
            <div className="progress-line"><div style={{ width: `${Math.min(100, (env.n / env.needed) * 100)}%` }} /></div>
            <p className="muted small">Your step budget appears after a few days of watch data. Steps today: {fmt(t.steps)}.</p>
          </>
        )}
        <div className="plan-screens">
          <div className="ps-head">
            <span>Screens today</span>
            <strong>{plan.screens.total != null ? fmtHM(plan.screens.total * 60) : '–'}{plan.screens.budget ? <span className="unit"> / ~{fmtHM(plan.screens.budget * 60)}</span> : null}</strong>
          </div>
          {plan.screens.budget && plan.screens.total != null && (
            <div className="ps-bar">
              <div className="ps-laptop" style={{ width: `${Math.min(100, ((plan.screens.laptop || 0) / Math.max(plan.screens.budget, plan.screens.total) / 1.1) * 100)}%` }} />
              <div className="ps-phone" style={{ width: `${Math.min(100, ((plan.screens.phone || 0) / Math.max(plan.screens.budget, plan.screens.total) / 1.1) * 100)}%` }} />
              <div className="env-mark safe" style={{ left: `${(plan.screens.budget / Math.max(plan.screens.budget, plan.screens.total) / 1.1) * 100}%` }} />
            </div>
          )}
          <div className="ps-legend">
            <span><i className="sw-l" />Laptop / work {fmtHM(plan.screens.laptop != null ? plan.screens.laptop * 60 : null)}{plan.screens.laptopOpen != null && <b className="live"> · on now {fmtHM(plan.screens.laptopOpen)}</b>}</span>
            <span><i className="sw-p" />Phone {fmtHM(plan.screens.phone != null ? plan.screens.phone * 60 : null)}</span>
          </div>
        </div>
        <div className="plan-rest">
          <span>Rest breaks to plan</span>
          <strong>{plan.restTarget}</strong>
        </div>
        <ul className="tips">
          {plan.tips.map((tip) => <li key={tip.id}>{tip.text}</li>)}
        </ul>
      </section>

      <SpikesCard events={a.events} sessions={a.screenSessions} today={a.today} aboveToday={t.hr_above_min} ceiling={b.hrCeiling} onTag={onTag} />

      {(s.level === 'amber' || s.level === 'red' || plan.recovery.active) && (
        <section className="card">
          <div className="card-head"><h3>What’s worked before</h3></div>
          <WhatWorked a={a} level={plan.recovery.active ? 'red' : s.level} compact />
        </section>
      )}

      {notes.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Things I’ve noticed</h3></div>
          <ul className="notices">
            {notes.map((n) => (
              <li key={n.title} className={n.tone}>
                <span className="n-icon" aria-hidden="true">{n.tone === 'good' ? '↗' : n.tone === 'watch' ? '!' : '·'}</span>
                <div><strong>{n.title}</strong><p>{n.text}</p></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.hrCeiling && (
        <section className="card hr-card">
          <div>
            <div className="signal-label">Heart-rate ceiling</div>
            <div className="signal-value">{b.hrCeiling}<span className="unit"> bpm</span></div>
          </div>
          <p className="muted small">Resting {Math.round(b.rhr)} + 15. Try not to spend more than a couple of minutes above it; if you do, rest until you’re back near {Math.round(b.rhr) + 10}.</p>
        </section>
      )}

      <div className="section-label">
        <h2>Last 14 days vs your targets</h2>
        <p className="muted small">The line is where you should be. Tap a bar to see that day.</p>
        <TargetLegend />
      </div>
      <TargetCard spec={specs.sleep} days={last14} />
      {specs.rhr && <TargetCard spec={specs.rhr} days={last14} />}
      {specs.hrv && <TargetCard spec={specs.hrv} days={last14} />}
      {specs.steps && <TargetCard spec={specs.steps} days={last14.slice(0, -1)} title="Steps (full days)" />}
      {specs.symptom && <TargetCard spec={specs.symptom} days={last14} />}

      <button className={`checkin-cta ${checkedIn ? 'done' : ''}`} onClick={() => onCheckIn()}>
        <div>
          <strong>{checkedIn ? 'Checked in today' : 'How are you today?'}</strong>
          <span>{checkedIn ? 'Tap to update your check-in' : 'Log symptoms, screens and social — takes a minute'}</span>
        </div>
        <span className="chev">›</span>
      </button>
      {!y?.checkin && days.length > 1 && (
        <button className="link-btn" onClick={() => onCheckIn(y.date)}>Missed yesterday? Add yesterday’s check-in</button>
      )}
    </div>
  );
}
