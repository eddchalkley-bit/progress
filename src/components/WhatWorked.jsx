import { GENERAL_ADVICE } from '../lib/research.js';

// Personal advice from your own history, with evidence-based fallbacks.
export default function WhatWorked({ a, level, compact = false }) {
  const w = a.worked;
  const lvl = level === 'red' ? 'red' : 'amber';
  const inCrash = a.crashes.episodes.some((e) => e.ongoing);
  const showRecovery = (lvl === 'red' || inCrash || !compact) && w.recovery.ready;

  return (
    <div className="worked">
      {w.ready ? (
        <>
          <p className="worked-lead">
            You’ve been close to the edge <strong>{w.events}</strong> times and avoided a crash <strong>{w.avoided}</strong> of them.
            {w.tips.length > 0 ? ' When you avoided one, over the next two days you:' : ' Not enough difference yet to say what made it work.'}
          </p>
          {w.tips.length > 0 && <ul className="worked-list">{w.tips.map((t) => <li key={t.key}>{t.text}</li>)}</ul>}
        </>
      ) : (
        <p className="worked-lead muted">
          {w.events > 0
            ? `You’ve had ${w.events} warning ${w.events === 1 ? 'day' : 'days'} so far — personal advice appears after two that didn’t end in a crash. Until then, the evidence says:`
            : 'Personal advice builds up as Progress sees how you respond to warning days. Until then, the evidence says:'}
        </p>
      )}
      {(!w.ready || w.tips.length < 2) && (
        <ul className="worked-list general">{GENERAL_ADVICE[lvl].slice(0, compact ? 3 : 4).map((t) => <li key={t}>{t}</li>)}</ul>
      )}
      {showRecovery && (
        <>
          <h4>Your quicker recoveries{w.recovery.quickDays ? ` (~${w.recovery.quickDays} days)` : ''}</h4>
          <ul className="worked-list">{w.recovery.tips.map((t) => <li key={t.key}>{t.text}</li>)}</ul>
        </>
      )}
    </div>
  );
}
