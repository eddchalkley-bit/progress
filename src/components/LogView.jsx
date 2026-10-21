import { useEffect, useState } from 'react';
import { SYMPTOMS } from '../lib/analysis.js';
import { addDays, fmtDay } from '../lib/time.js';
import { fmtHM } from '../lib/screens.js';

const EMPTY = { am_fatigue: null, am_brain_fog: null, am_breath: null, am_aches: null, am_heart: null, am_rested: null, fatigue: null, brain_fog: null, breath: null, aches: null, heart: null, pem: false, screen_hours: null, phone_hours: null, laptop_hours: null, social: null, mental: null, stress: null, rests: null, food: null, notes: '' };
const SOCIAL = ['None', 'Light', 'Moderate', 'Heavy'];
const FOOD = ['Poor', 'Not great', 'OK', 'Good', 'Excellent — rare!'];
const LOAD = ['Low', 'Some', 'High', 'Very high'];
const RESTED = ['Exhausted', 'Tired', 'OK', 'Refreshed'];
const avgOf = (form, prefix) => {
  const v = SYMPTOMS.map((s) => form[prefix + s.key]).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + Number(b), 0) / v.length : null;
};

function sevLabel(v) {
  if (v == null) return 'Not set';
  if (v === 0) return 'None';
  if (v <= 3) return 'Mild';
  if (v <= 6) return 'Moderate';
  if (v <= 8) return 'Severe';
  return 'Very severe';
}

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o} role="radio" aria-checked={value === i} className={value === i ? 'on' : ''} onClick={() => onChange(value === i ? null : i)}>{o}</button>
      ))}
    </div>
  );
}

function HoursField({ label, hint, k, form, set, tracked }) {
  const v = form[k];
  return (
    <div className="field">
      <div className="field-top">
        <span>{label}</span>
        {tracked != null
          ? <button className="link-btn small" onClick={() => set(k, Math.round((tracked / 60) * 4) / 4)}>Tracked {fmtHM(tracked)} · use</button>
          : <span className="muted small">{hint}</span>}
      </div>
      <div className="stepper">
        <button onClick={() => set(k, Math.max(0, (Number(v) || 0) - 0.25))} aria-label={`Less ${label}`}>−</button>
        <div className="stepper-val">{v == null ? '–' : fmtHM(Number(v) * 60)}</div>
        <button onClick={() => set(k, Math.min(24, v == null ? 2 : Number(v) + 0.25))} aria-label={`More ${label}`}>+</button>
      </div>
    </div>
  );
}

export default function LogView({ a, date, setDate, mode, setMode, today, onSave }) {
  const day = a.days.find((d) => d.date === date);
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState('idle');
  const [err, setErr] = useState('');

  useEffect(() => {
    const c = day?.checkin;
    const pre = { ...EMPTY };
    if (day?.phone_min != null) pre.phone_hours = Math.round((day.phone_min / 60) * 4) / 4;
    if (day?.laptop_min != null) pre.laptop_hours = Math.round((day.laptop_min / 60) * 4) / 4;
    setForm(c ? { ...pre, ...c, phone_hours: c.phone_hours ?? pre.phone_hours, laptop_hours: c.laptop_hours ?? pre.laptop_hours, notes: c.notes || '' } : pre);
    setState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setState('idle'); };
  const hasAm = SYMPTOMS.some((s) => day?.checkin?.[`am_${s.key}`] != null);
  const hasPm = SYMPTOMS.some((s) => day?.checkin?.[s.key] != null);
  const part = mode || (date === today && new Date().getHours() < 14 && !hasPm ? 'morning' : 'evening');
  const choose = (m) => { setMode(m); setState('idle'); window.scrollTo(0, 0); };
  const prefix = part === 'morning' ? 'am_' : '';
  const touched = SYMPTOMS.some((s) => form[prefix + s.key] != null) || (part === 'morning' && form.am_rested != null);
  const amAvg = avgOf(form, 'am_'), pmAvg = avgOf(form, '');

  const save = async () => {
    setState('saving'); setErr('');
    try {
      if (part === 'morning') {
        const am = { part: 'morning', date, am_rested: form.am_rested };
        for (const s of SYMPTOMS) am[`am_${s.key}`] = form[`am_${s.key}`];
        await onSave(am);
      } else {
        const pm = { ...form, date };
        for (const k of Object.keys(pm)) if (k.startsWith('am_')) delete pm[k];
        await onSave(pm);
      }
      setState('saved');
    } catch (e) { setErr(e.message); setState('idle'); }
  };

  const chips = [today, addDays(today, -1), addDays(today, -2)];
  const quick = day?.quick || [];

  return (
    <div className="screen">
      <header className="top">
        <div>
          <div className="eyebrow">{part === 'morning' ? 'Morning check-in' : 'End-of-day check-in'}</div>
          <h1>{date === today ? 'Today' : fmtDay(date, { weekday: 'long', day: 'numeric', month: 'short' })}</h1>
        </div>
      </header>

      <div className="chips">
        {chips.map((d, i) => (
          <button key={d} className={d === date ? 'chip on' : 'chip'} onClick={() => setDate(d)}>
            {i === 0 ? 'Today' : i === 1 ? 'Yesterday' : fmtDay(d, { weekday: 'short' })}
          </button>
        ))}
        <input type="date" className="chip date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Pick a date" />
      </div>

      <div className="segmented part-toggle" role="radiogroup" aria-label="Which check-in">
        <button role="radio" aria-checked={part === 'morning'} className={part === 'morning' ? 'on' : ''} onClick={() => choose('morning')}>Morning{hasAm ? ' ✓' : ''}</button>
        <button role="radio" aria-checked={part === 'evening'} className={part === 'evening' ? 'on' : ''} onClick={() => choose('evening')}>End of day{hasPm ? ' ✓' : ''}</button>
      </div>

      <section className="card">
        <div className="card-head">
          <h3>{part === 'morning' ? 'How are you this morning?' : 'Symptoms through the day'}</h3>
          <span className="muted small">0 none · 10 worst</span>
        </div>
        {part === 'evening' && amAvg != null && (
          <p className="compare-line">This morning averaged <b>{amAvg.toFixed(1)}</b>{pmAvg != null ? <> · now <b>{pmAvg.toFixed(1)}</b> <span className={pmAvg - amAvg >= 1 ? 'worse' : pmAvg - amAvg <= -1 ? 'better' : ''}>({pmAvg - amAvg >= 0 ? '+' : '−'}{Math.abs(pmAvg - amAvg).toFixed(1)})</span></> : null}</p>
        )}
        {SYMPTOMS.map((s) => {
          const k = prefix + s.key;
          const am = part === 'evening' ? form[`am_${s.key}`] : null;
          return (
            <div key={k} className="slider-row">
              <div className="slider-top">
                <label htmlFor={k}>{s.label}{am != null && <span className="am-hint">morning {am}</span>}</label>
                <span className={`sev ${form[k] == null ? 'unset' : ''}`}>{form[k] ?? '–'} · {sevLabel(form[k])}</span>
              </div>
              <input id={k} type="range" min="0" max="10" step="1" value={form[k] ?? 0}
                className={form[k] == null ? 'unset' : ''}
                style={{ '--pct': `${((form[k] ?? 0) / 10) * 100}%` }}
                onChange={(e) => set(k, Number(e.target.value))} />
            </div>
          );
        })}
        {part === 'morning' && (
          <div className="field">
            <div className="field-top"><span>How did you wake up?</span></div>
            <Segmented label="How did you wake up" options={RESTED} value={form.am_rested} onChange={(v) => set('am_rested', v)} />
          </div>
        )}
        {part === 'morning' && <p className="muted small">Do this soon after waking, before the day gets going. Screens, social and the rest come in the end-of-day check-in.</p>}
        {part === 'evening' && <label className="toggle-row">
          <div>
            <strong>Crash / PEM day</strong>
            <span className="muted small">A clear worsening after exertion</span>
          </div>
          <input type="checkbox" className="switch" checked={!!form.pem} onChange={(e) => set('pem', e.target.checked)} />
        </label>}
      </section>

      {part === 'evening' && <section className="card">
        <div className="card-head"><h3>What the day asked of you</h3></div>
        <HoursField label="Phone screen time" hint="Settings › Screen Time on your iPhone" k="phone_hours" form={form} set={set} tracked={day?.phone_min} />
        <HoursField label="Laptop / work time" hint="anything on a computer" k="laptop_hours" form={form} set={set} tracked={day?.laptop_min} />
        <div className="field">
          <div className="field-top"><span>Social interaction</span></div>
          <Segmented label="Social interaction" options={SOCIAL} value={form.social} onChange={(v) => set('social', v)} />
        </div>
        <div className="field">
          <div className="field-top"><span>Mental load</span><span className="muted small">work, planning, concentration</span></div>
          <Segmented label="Mental load" options={LOAD} value={form.mental} onChange={(v) => set('mental', v)} />
        </div>
        <div className="field">
          <div className="field-top"><span>Emotional stress</span></div>
          <Segmented label="Emotional stress" options={LOAD} value={form.stress} onChange={(v) => set('stress', v)} />
        </div>
        <div className="field">
          <div className="field-top"><span>Rest breaks</span><span className="muted small">proper rests: lying or sitting, eyes closed</span></div>
          <Segmented label="Rest breaks" options={['0', '1–2', '3–4', '5+']} value={form.rests} onChange={(v) => set('rests', v)} />
        </div>
        <div className="field">
          <div className="field-top"><span>Healthy eating today</span><span className="muted small">{form.food ? FOOD[form.food - 1] : '1 poor · 5 excellent'}</span></div>
          <div className="segmented five" role="radiogroup" aria-label="Healthy eating today">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={form.food === n} className={form.food === n ? 'on' : ''} onClick={() => set('food', form.food === n ? null : n)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="field-top"><span>Notes</span></div>
          <textarea rows="3" value={form.notes} placeholder="Anything that stood out — a busy meeting, a walk, a nap…" onChange={(e) => set('notes', e.target.value)} />
        </div>
      </section>}

      {quick.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Energy logged from your watch</h3></div>
          <div className="quick-list">
            {quick.map((q, i) => (
              <div key={i} className="quick-item">
                <span>{new Date(q.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                <strong>{q.energy}/10</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {err && <div className="error-banner">{err}</div>}
      <div className="save-bar">
        <button className="primary" onClick={save} disabled={state === 'saving' || (!touched && !(part === 'evening' && form.pem))}>
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : part === 'morning' ? 'Save morning check-in' : 'Save end-of-day check-in'}
        </button>
      </div>
    </div>
  );
}
