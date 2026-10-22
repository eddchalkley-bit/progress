import { useState } from 'react';
import { LogoMark } from './Logo.jsx';
import { signIn, signUp } from '../lib/api.js';

// First screen for anyone not signed in: create an account, sign in, or explore the demo.
export default function Welcome({ onDemo, onLegacyToken }) {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [legacy, setLegacy] = useState(false);
  const [tok, setTok] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'signup') await signUp(email, password, code);
      else await signIn(email, password);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="welcome">
      <div className="wl-hero">
        <div className="wl-mark"><LogoMark size={88} title="Progress" /></div>
        <h1 className="wl-title">progress</h1>
        <p className="wl-tag">A pacing coach that learns your normal from your watch, and helps you stay inside it.</p>
      </div>

      <ul className="wl-points">
        <li><b>Your own baseline</b><span>Recovery, sleep need and energy budget learned from you, not averages.</span></li>
        <li><b>See load building up</b><span>The last few days add up. Progress shows it before it catches up with you.</span></li>
        <li><b>A minute a day</b><span>Morning and evening check-ins, then Progress does the rest.</span></li>
      </ul>

      <section className="card wl-card">
        <div className="segmented two" role="tablist">
          <button role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
        </div>
        <form onSubmit={submit} className="wl-form">
          <label>Email<input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'signup' && <small className="muted">At least 8 characters.</small>}
          </label>
          {mode === 'signup' && (
            <label>Invite code <small className="muted">(if you were given one)</small><input type="text" autoCapitalize="none" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          )}
          {error && <p className="wl-error" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        </form>
      </section>

      <button className="secondary wl-demo" onClick={onDemo}>Explore the demo first</button>
      <p className="muted small center">The demo shows Progress after a few months of use, with sample data.</p>

      <div className="wl-legacy">
        {!legacy ? (
          <button className="link-btn" onClick={() => setLegacy(true)}>I set up Progress with a token</button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (tok.trim()) onLegacyToken(tok.trim()); }} className="token-row">
            <input type="password" placeholder="Paste your token" value={tok} onChange={(e) => setTok(e.target.value)} autoComplete="off" />
            <button className="primary small">Use</button>
          </form>
        )}
      </div>
      <p className="muted small center wl-foot">Not a medical device · <a href="/privacy.html">Privacy</a></p>
    </div>
  );
}
