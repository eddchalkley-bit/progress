import { useState } from 'react';
import { fmtDay, localDate } from '../lib/time.js';
import { statusOf, describe, STATUS_LABEL } from '../lib/targets.js';

// Bars grow up or down from YOUR target line. The shaded band is the target range.
// Colour shows whether each day was on target, on the better side, a little off, or well off.
export function TargetChart({ series, spec, height = 150 }) {
  const lastIdx = series.length - 1;
  const [sel, setSel] = useState(() => {
    for (let i = lastIdx; i >= 0; i--) if (series[i].value != null) return i;
    return lastIdx;
  });
  const W = 340, H = height, padL = 4, padR = 44, padT = 10, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const [lo, hi] = spec.band;
  const vals = series.map((s) => s.value).filter((v) => v != null);
  let vmin = Math.min(lo, spec.target, ...vals);
  let vmax = Math.max(hi, spec.target, ...vals);
  const pad = (vmax - vmin) * 0.12 || 1;
  vmin = spec.floorZero ? 0 : vmin - pad;
  vmax += pad * (spec.zeroBars ? 1.6 : 1);
  const y = (v) => padT + (1 - (v - vmin) / (vmax - vmin)) * ih;
  const slot = iw / series.length;
  const bw = Math.min(16, slot * 0.62);
  const cx = (i) => padL + slot * i + slot / 2;
  const ty = y(spec.target);
  const cur = series[sel];
  const curStatus = statusOf(cur?.value, spec);

  return (
    <div className="tchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${spec.label} for the last ${series.length} days against your target`}>
        {!spec.zeroBars && <rect x={padL} width={iw} y={y(hi)} height={Math.max(1, y(lo) - y(hi))} className="t-band" rx="3" />}
        {series.map((s, i) => {
          if (s.value == null) return <circle key={s.date} cx={cx(i)} cy={ty} r="1.6" className="t-missing" />;
          const st = statusOf(s.value, spec);
          if (spec.zeroBars) {
            const top = y(s.value), h = Math.max(2.5, y(0) - top);
            return (
              <g key={s.date}>
                <rect x={cx(i) - bw / 2} y={top} width={bw} height={h} rx="2.5" className={`t-bar up ${st} ${i === sel ? 'sel' : ''}`} style={{ '--i': i }} />
                {series.length <= 14 && spec.short && <text x={cx(i)} y={top - 4} className="t-vlabel" textAnchor="middle">{spec.short(s.value)}</text>}
              </g>
            );
          }
          const top = Math.min(ty, y(s.value));
          const h = Math.max(2.5, Math.abs(y(s.value) - ty));
          return (
            <rect key={s.date} x={cx(i) - bw / 2} y={s.value >= spec.target ? ty - h : top} width={bw} height={h} rx="2.5"
              className={`t-bar ${s.value >= spec.target ? 'up' : 'down'} ${st} ${i === sel ? 'sel' : ''}`} style={{ '--i': i }} />
          );
        })}
        <line x1={padL} x2={padL + iw} y1={ty} y2={ty} className="t-target" />
        <text x={W - padR + 6} y={ty - 3} className="t-tlabel">{spec.targetLabel}</text>
        <text x={W - padR + 6} y={ty + 9} className="t-tsub">target</text>
        {series.map((s, i) => s.crash && <circle key={'c' + s.date} cx={cx(i)} cy={H - padB + 8} r="2.6" className="t-crash" />)}
        <text x={padL} y={H - 2} className="t-axis">{fmtDay(series[0].date, { day: 'numeric', month: 'short' })}</text>
        <text x={padL + iw} y={H - 2} className="t-axis" textAnchor="end">{i18nDay(series[lastIdx].date)}</text>
        {series.map((s, i) => (
          <rect key={'h' + s.date} x={padL + slot * i} y={0} width={slot} height={H - padB} fill="transparent"
            onClick={() => setSel(i)} style={{ cursor: 'pointer' }} />
        ))}
      </svg>
      <div className="t-readout">
        <span>{i18nDay(cur.date)}</span>
        <strong>{cur.value == null ? 'No data' : `${spec.fmt(cur.value)}${spec.unit}`}</strong>
        {curStatus && <span className={`t-pill ${curStatus}`}>{describe(cur.value, spec)}</span>}
      </div>
    </div>
  );
}

function i18nDay(date) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  if (date === localDate(now, tz)) return 'Today';
  if (date === localDate(new Date(now.getTime() - 86400e3), tz)) return 'Yesterday';
  return fmtDay(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function TargetLegend({ crash = false }) {
  return (
    <div className="t-legend">
      <span><i className="sw band" />Target range</span>
      <span><i className="sw on" />{STATUS_LABEL.on}</span>
      <span><i className="sw good" />Better</span>
      <span><i className="sw warn" />A little off</span>
      <span><i className="sw bad" />Well off</span>
      {crash && <span><i className="sw crash" />Crash</span>}
    </div>
  );
}

// Summary of the window: how many days on target / better / off.
export function windowSummary(series, spec) {
  const c = { on: 0, good: 0, warn: 0, bad: 0 };
  for (const s of series) { const st = statusOf(s.value, spec); if (st) c[st]++; }
  return c;
}
