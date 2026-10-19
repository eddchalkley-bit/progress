import { useEffect, useState } from 'react';
import { SYMPTOMS } from '../lib/analysis.js';
import { addDays, fmtDay } from '../lib/time.js';
import { fmtHM } from '../lib/screens.js';

const EMPTY = { fatigue: null, brain_fog: null, breath: null, aches: null, heart: null, pem: false, screen_hours: null, phone_hours: null, laptop_hours: null, social: null, mental: null, stress: null, rests: null, notes: '' };
const SOCIAL = ['None', 'Light', 'Moderate', 'Heavy'];
const LOAD = ['Low', 'Some', 'High', 'Very high'];

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

export default function LogView({ a, date, setDate, today, onSave }) {
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
  const touched = SYMPTOMS.some((s) => form[s.key] != null);

  const save = async () => {
    setState('saving'); setErr('');
    try {
      await onSave({ ...form, date });
      setState('saved');
    } catch (e) { setErr(e.message); setState('idle'); }
  };

  const chips = [today, addDays(today, -1), addDays(today, -2)];
  const quick = day?.quick || [];

  return (
    <div className="screen">
      <header className="top">
        <div>
          <div className="eyebrow">Daily check-in</div>
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

      <section className="card">
        <div className="card-head"><h3>Symptoms</h3><span className="muted small">0 none · 10 worst</span></div>
        {SYMPTOMS.map((s) => (
          <div key={s.key} className="slider-row">
            <div className="slider-top">
              <label htmlFor={s.key}>{s.label}</label>
              <span className={`sev ${form[s.key] == null ? 'unset' : ''}`}>{form[s.key] ?? '–'} · {sevLabel(form[s.key])}</span>
            </div>
            <input id={s.key} type="range" min="0" max="10" step="1" value={form[s.key] ?? 0}
              className={form[s.key] == null ? 'unset' : ''}
              style={{ '--pct': `${((form[s.key] ?? 0) / 10) * 100}%` }}
              onChange={(e) => set(s.key, Number(e.target.value))} />
          </div>
        ))}
        <label className="toggle-row">
          <div>
            <strong>Crash / PEM day</strong>
            <span className="muted small">A clear worsening after exertion</span>
          </div>
          <input type="checkbox" className="switch" checked={!!form.pem} onChange={(e) => set('pem', e.target.checked)} />
        </label>
      </section>

      <section className="card">
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
          <div className="field-top"><span>Notes</span></div>
          <textarea rows="3" value={form.notes} placeholder="Anything that stood out — a busy meeting, a walk, a nap…" onChange={(e) => set('notes', e.target.value)} />
        </div>
      </section>

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
        <button className="primary" onClick={save} disabled={state === 'saving' || (!touched && !form.pem)}>
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved ✓' : 'Save check-in'}
        </button>
      </div>
    </div>
  );
}
