import { useState } from 'react';
import { fmtMinutes } from '../lib/time.js';

// "Is this getting better?" One panel, one shared time axis. Crash days run as a pale band
// through every chart, so you can see what happened to sleep, HRV and symptoms around each one.
const RANGES = [{ n: 14, label: '2 weeks' }, { n: 30, label: '30 days' }, { n: 90, label: '3 months' }];
const W = 340, PAD = 4;

const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };

function Delta({ cur, prev, fmt, goodWhen, unit = '' }) {
  if (cur == null) return <span className="tr-delta">not enough data yet</span>;
  if (prev == null) return <span className="tr-delta">{' '}</span>;
  const d = cur - prev;
  const same = Math.abs(d) < 1e-9 || fmt(cur) === fmt(prev);
  const good = goodWhen === 'down' ? d < 0 : d > 0;
  const cls = same ? '' : good ? 'good' : 'bad';
  const arrow = same ? '→' : d > 0 ? '↑' : '↓';
  return <span className={`tr-delta ${cls}`}>{arrow} {same ? 'same as before' : `${good ? 'better' : 'worse'} than before`}</span>;
}

function Strip({ title, note, days, flags, value, max, min = 0, tone, target, fmtVal, last }) {
  const n = days.length;
  const slot = (W - PAD * 2) / n;
  const bw = Math.max(1.5, Math.min(14, slot * 0.68));
  const H = 78, top = 6, base = H - 6;
  const vals = days.map(value);
  const y = (v) => base - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * (base - top);
  const x = (i) => PAD + slot * i + slot / 2;
  return (
    <section className="card tr-strip">
      <div className="card-head"><h3>{title}</h3><span className="tr-last">{last}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} over the last ${n} days. ${note}`}>
        {flags.map((f, i) => f ? <rect key={`c${i}`} className="tr-crash" x={x(i) - slot / 2} y={0} width={slot} height={H} /> : null)}
        <line className="tr-base" x1={PAD} x2={W - PAD} y1={base} y2={base} />
        {target != null && <line className="tr-target" x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)} />}
        {vals.map((v, i) => v == null ? null : (
          <rect key={i} className={`tr-bar ${tone(v, i)}`} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(2, base - y(v))} rx={Math.min(3, bw / 2)} />
        ))}
      </svg>
      <p className="muted small tr-note">{note}</p>
    </section>
  );
}

export default function Trends({ a }) {
  const [range, setRange] = useState(30);
  const all = a.days;
  const total = all.length;
  const n = Math.min(range, total);
  const cur = all.slice(total - n);
  const prev = all.slice(Math.max(0, total - 2 * n), total - n);
  const flagsAll = a.crashes.flags;
  const curFlags = cur.map((_, i) => Boolean(flagsAll[total - n + i]));
  const prevFlags = prev.map((_, i) => Boolean(flagsAll[Math.max(0, total - 2 * n) + i]));
  const b = a.baseline;
  const enough = n >= 7;

  const crashes = curFlags.filter(Boolean).length;
  const crashesPrev = prev.length >= Math.min(n, 7) ? prevFlags.filter(Boolean).length : null;
  const sym = avg(cur.map((d) => d.symptom)), symPrev = avg(prev.map((d) => d.symptom));
  const sleep = avg(cur.map((d) => d.sleep_min)), sleepPrev = avg(prev.map((d) => d.sleep_min));
  const hrv = avg(cur.map((d) => d.hrv)), hrvPrev = avg(prev.map((d) => d.hrv));
  const steady = (ds, fl) => {
    const logged = ds.map((d, i) => ({ d, f: fl[i] })).filter((x) => x.d.symptom != null);
    return logged.length ? logged.filter((x) => !x.f && (b.symptom == null || x.d.symptom <= b.symptom + 1)).length / logged.length : null;
  };
  const st = steady(cur, curFlags), stPrev = prev.length ? steady(prev, prevFlags) : null;
  const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);

  if (total < 5) return null;
  const lastVal = (k, f) => { for (let i = cur.length - 1; i >= 0; i--) if (cur[i][k] != null) return f(cur[i][k]); return '–'; };

  return (
    <div className="trends">
      <div className="section-label">
        <h2>Is it getting better?</h2>
        <p className="muted small">Compared with the {n} days before. Pale red bands mark crash days.</p>
      </div>
      <div className="segmented three" role="tablist" aria-label="Time range">
        {RANGES.map((r) => <button key={r.n} role="tab" aria-selected={range === r.n} className={range === r.n ? 'on' : ''} onClick={() => setRange(r.n)}>{r.label}</button>)}
      </div>

      <section className="card tr-summary">
        <div className="tr-tiles">
          <div className="tr-tile">
            <span>Crash days</span>
            <strong>{crashes}</strong>
            {enough && <Delta cur={crashes} prev={crashesPrev} fmt={String} goodWhen="down" />}
          </div>
          <div className="tr-tile">
            <span>Steady days</span>
            <strong>{pct(st)}</strong>
            {enough && <Delta cur={st} prev={stPrev} fmt={pct} goodWhen="up" />}
          </div>
          <div className="tr-tile">
            <span>Symptoms (0–10)</span>
            <strong>{sym == null ? '–' : sym.toFixed(1)}</strong>
            {enough && <Delta cur={sym} prev={symPrev} fmt={(v) => v.toFixed(1)} goodWhen="down" />}
          </div>
          <div className="tr-tile">
            <span>Average sleep</span>
            <strong>{sleep == null ? '–' : fmtMinutes(sleep)}</strong>
            {enough && <Delta cur={sleep} prev={sleepPrev} fmt={(v) => String(Math.round(v / 10))} goodWhen="up" />}
          </div>
        </div>
        <p className="muted small tr-foot">Steady means no crash and symptoms within a point of your usual. With long COVID, progress is slow and uneven, so fewer crash days and more steady days matter more than doing more.</p>
      </section>

      <Strip title="Symptoms" note="Average of your logged symptoms each day. Lower is better. Orange days were worse than usual; the line is your usual."
        days={cur} flags={curFlags} value={(d) => d.symptom} max={10} target={b.symptom}
        tone={(v) => (b.symptom != null && v > b.symptom + 1 ? 'warn' : 'on')} last={lastVal('symptom', (v) => `${v.toFixed(1)} today`)} />
      <Strip title="Sleep" note="Hours asleep each night. Orange nights were well under your usual."
        days={cur} flags={curFlags} value={(d) => (d.sleep_min != null ? d.sleep_min / 60 : null)} max={10} target={b.sleep != null ? b.sleep / 60 : null}
        tone={(v) => (b.sleep != null && v * 60 < b.sleep * 0.85 ? 'warn' : 'on')} last={lastVal('sleep_min', (v) => fmtMinutes(v))} />
      <Strip title="Heart-rate variability" note="Higher means your body is coping better. Orange days were below your normal, shown by the line."
        days={cur} flags={curFlags} value={(d) => d.hrv} min={0} max={Math.max(60, ...cur.map((d) => d.hrv || 0)) * 1.1} target={b.hrv}
        tone={(v) => (b.hrv != null && v < b.hrv * 0.9 ? 'warn' : 'on')} last={lastVal('hrv', (v) => `${Math.round(v)} ms`)} />
    </div>
  );
}
