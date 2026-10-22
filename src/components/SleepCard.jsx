import { fmtMinutes, fmtClock, fmtDay } from '../lib/time.js';
import { scoreWord } from '../lib/sleep.js';

const signed = (min) => (min == null ? '' : `${min >= 0 ? '+' : '−'}${fmtMinutes(Math.abs(min))}`);
const tone = (s) => (s == null ? '' : s >= 85 ? 'good' : s >= 70 ? 'on' : s >= 50 ? 'warn' : 'bad');

// Today: last night, what it did to today's energy, and tonight's target.
export default function SleepCard({ s, energy }) {
  const L = s.last;
  if (!L) {
    return (
      <section className="card sleep">
        <div className="card-head"><h3>Last night</h3></div>
        <p className="muted small">{s.coach[0]}</p>
      </section>
    );
  }
  const gap = L.sleep - s.need;
  const bedDiff = L.bed != null && s.usualBed != null ? L.bed - s.usualBed : null;
  const rows = [
    {
      label: 'Duration', pts: s.parts.duration, max: 50,
      value: fmtMinutes(L.sleep), note: `${signed(gap)} vs your ${fmtMinutes(s.need)}`,
    },
    s.parts.timing != null && {
      label: 'Bedtime', pts: s.parts.timing, max: 30,
      value: fmtClock(L.bed),
      note: bedDiff == null ? '' : Math.abs(bedDiff) < 20 ? 'your usual time' : `${fmtMinutes(Math.abs(bedDiff))} ${bedDiff < 0 ? 'earlier' : 'later'} than usual`,
    },
    s.parts.calm != null && {
      label: 'Unbroken', pts: s.parts.calm, max: 20,
      value: L.wakeups != null ? `${L.wakeups} wake-up${L.wakeups === 1 ? '' : 's'}` : fmtMinutes(L.awake),
      note: L.awake != null ? `${fmtMinutes(L.awake)} awake${s.usualAwake != null ? ` · usually ${fmtMinutes(s.usualAwake)}` : ''}` : '',
    },
  ].filter(Boolean);

  const pct = Math.round((s.potential - 1) * 100);

  return (
    <section className="card sleep" aria-labelledby="sleep-h">
      <div className="card-head">
        <h3 id="sleep-h">Last night</h3>
        <span className={`t-pill ${tone(s.score)}`}>{scoreWord(s.score)} · {s.score}</span>
      </div>

      <div className="sl-hero">
        <div className="sl-big">{fmtMinutes(L.sleep)}</div>
        <div className="sl-sub">
          asleep{L.nap ? ` + ${fmtMinutes(L.nap)} nap` : ''} · your need is <b>{fmtMinutes(s.need)}</b>
          {!s.learned && <span className="muted"> (for now)</span>}
        </div>
      </div>

      <ul className="sl-rows">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="sl-row-top">
              <span className="sl-label">{r.label}</span>
              <span className="sl-val">{r.value}</span>
            </div>
            <div className="sl-meter" aria-hidden="true"><i style={{ width: `${(r.pts / r.max) * 100}%` }} className={tone((r.pts / r.max) * 100)} /></div>
            <div className="sl-note">{r.note}</div>
          </li>
        ))}
      </ul>

      {s.body && (
        <div className="sl-body">
          <span className={`sl-chip ${s.body}`}>{s.body === 'recovered' ? 'Body recovered' : s.body === 'partly' ? 'Partly recovered' : 'Body still under strain'}</span>
          {s.hrvPct != null && <span className="sl-chip plain">HRV {s.hrvPct >= 0 ? '+' : '−'}{Math.abs(Math.round(s.hrvPct * 100))}%</span>}
          {s.rhrDelta != null && <span className="sl-chip plain">Resting HR {s.rhrDelta >= 0 ? '+' : '−'}{Math.abs(Math.round(s.rhrDelta))}</span>}
        </div>
      )}

      <div className={`sl-impact ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}`}>
        <div>
          <span className="sl-impact-k">Today’s energy potential</span>
          <span className="sl-impact-v">{pct > 0 ? '+' : pct < 0 ? '−' : '±'}{Math.abs(pct)}%{energy?.ready && energy.sleepDelta ? <small> ({energy.sleepDelta > 0 ? '+' : '−'}{Math.abs(energy.sleepDelta)} EU)</small> : null}</span>
        </div>
        <p>{energy?.ready && energy.factor < 1 && pct >= 0
          ? 'Last night helped, but today’s status still calls for a lighter day — see Today’s energy.'
          : pct > 0 ? 'Your budget stays at your normal. Banking the extra is how your baseline grows.'
            : pct < 0 ? 'Today’s budget and crash line are lowered to match.'
              : 'A normal night — today’s budget is your usual.'}</p>
      </div>

      <WeekChart s={s} />

      {s.coach.length > 0 && (
        <ul className="sl-coach">{s.coach.slice(0, 3).map((c, i) => <li key={i}>{c}</li>)}</ul>
      )}

      <p className="muted small sl-foot">
        {s.learned
          ? `Your need is learned from the sleep before ${s.goodNights} of your good days.`
          : `Using 8h (NHS range 7–9h) until Progress has ${s.nightsNeeded} more good days to learn your own need.`}
      </p>
    </section>
  );
}

// Last 7 nights against YOUR need, with how the next day went underneath.
function WeekChart({ s }) {
  const W = 320, H = 116, top = 14, base = 86;
  const vals = s.series.map((x) => (x.sleep ?? 0) + (x.nap || 0)).filter((v) => v > 0);
  // Start the axis a few hours below your need so night-to-night differences are visible.
  const floor = Math.max(0, Math.min(s.need - 180, ...vals.map((v) => v - 30)));
  const max = Math.max(s.need + 75, ...vals);
  const y = (v) => base - ((Math.max(v, floor) - floor) / (max - floor)) * (base - top);
  const n = s.series.length, slot = (W - 44) / n, bw = Math.min(26, slot * 0.6);
  const needY = y(s.need);
  return (
    <figure className="sl-week">
      <figcaption>
        <span>Last 7 nights</span>
        <span className={s.debt >= 120 ? 'debt warn' : 'debt'}>{s.debt == null ? '' : s.debt < 15 ? 'No sleep debt' : `Sleep debt ${fmtMinutes(s.debt)}`}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sleep for the last ${n} nights against your need of ${fmtMinutes(s.need)}`}>
        {s.series.map((x, i) => {
          const cx = 8 + slot * i + slot / 2;
          const v = x.sleep;
          const short = v != null && v + (x.nap || 0) < s.need - 15;
          const last = i === n - 1;
          return (
            <g key={x.date}>
              {v != null && <rect x={cx - bw / 2} y={y(v)} width={bw} height={base - y(v)} rx="4" className={`b ${short ? 'short' : 'ok'} ${last ? 'last' : ''}`} />}
              {x.nap > 0 && v != null && <rect x={cx - bw / 2} y={y(v + x.nap)} width={bw} height={y(v) - y(v + x.nap)} rx="3" className="b nap" />}
              {x.outcome && <circle cx={cx} cy={base + 10} r="3.5" className={`o ${x.outcome}`} />}
              <text x={cx} y={H - 4} textAnchor="middle" className="d">{last ? 'Last' : fmtDay(x.date, { weekday: 'narrow' })}</text>
            </g>
          );
        })}
        <line x1="4" x2={W - 40} y1={needY} y2={needY} className="need" />
        <text x={W - 36} y={needY + 4} className="need-l">{`${Math.floor(s.need / 60)}h${s.need % 60 ? String(s.need % 60).padStart(2, '0') : ''}`}</text>
      </svg>
      <div className="sl-week-key">
        <span><i className="k-ok" />Met your need</span>
        <span><i className="k-short" />Under your need</span>
        <span><i className="o-good" />Good day after</span>
        <span><i className="o-bad" />Hard day after</span>
      </div>
    </figure>
  );
}

// Insights: what Progress has learned about your sleep.
export function SleepInsights({ s }) {
  return (
    <section className="card sleep">
      <div className="card-head"><h3>Your sleep</h3><span className="muted small">{s.confidence.toLowerCase()} · {s.judgedNights} nights</span></div>
      <div className="kv-grid">
        <div><span>Your need</span><strong>{fmtMinutes(s.need)}</strong></div>
        <div><span>Best bedtime</span><strong>{s.targetBed != null ? fmtClock(s.targetBed) : '–'}</strong></div>
        <div><span>Usual bedtime</span><strong>{s.usualBed != null ? fmtClock(s.usualBed) : '–'}</strong></div>
        <div><span>Usual wake</span><strong>{s.usualWake != null ? fmtClock(s.usualWake) : '–'}</strong></div>
        <div><span>Bedtime varies by</span><strong>{s.bedSpread != null ? `±${fmtMinutes(s.bedSpread)}` : '–'}</strong></div>
        <div><span>Usual wake-ups</span><strong>{s.usualWakeups != null ? Math.round(s.usualWakeups) : '–'}</strong></div>
      </div>
      {s.effects.length > 0 || s.shortCrash ? (
        <ul className="sl-coach">
          {s.effects.map((e) => <li key={e.label}>{e.text}</li>)}
          {s.shortCrash && <li>{s.shortCrash}</li>}
        </ul>
      ) : (
        <p className="muted small">Progress needs a few more weeks of nights with check-ins to see how sleep affects your next day.</p>
      )}
      <p className="muted small">
        {s.learned
          ? 'Your need is the sleep before your good days, not a general target. Best bedtime is your need counted back from your usual wake-up, plus 15 minutes to fall asleep. A steady bedtime (within about 30 minutes) usually matters as much as length.'
          : 'Until your need is learned, Progress uses 8 hours (NHS range 7–9h).'}
        {' '}These are patterns in your own data, not proof of cause.
      </p>
    </section>
  );
}
