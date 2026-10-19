import { useState } from 'react';
import { CopyIcon, WatchIcon } from './Icons.jsx';
import { SYMPTOMS } from '../lib/analysis.js';
import { TAGS } from '../lib/spikes.js';

function Copy({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button className="copy" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
    }} aria-label={`Copy ${label}`}>
      <code>{text}</code>
      <span className="copy-icon">{done ? '✓' : <CopyIcon />}</span>
    </button>
  );
}

function Guide({ title, sub, icon, children, open }) {
  return (
    <details className="guide" open={open}>
      <summary>
        <div><strong>{icon}{title}</strong><span className="muted small">{sub}</span></div>
      </summary>
      <div className="guide-body">{children}</div>
    </details>
  );
}

const HEALTH_TYPES = [
  ['Resting Heart Rate', 'rhr', 'Day'],
  ['Heart Rate Variability', 'hrv', 'Day'],
  ['Steps', 'steps', 'Day'],
  ['Active Energy', 'energy', 'Day'],
  ['Exercise Minutes', 'exercise', 'Day'],
  ['Sleep Analysis', 'sleep', 'None'],
  ['Heart Rate (every reading)', 'hrs', 'None'],
];
const OPTIONAL_TYPES = [
  ['Heart Rate', 'hr'], ['Walking Heart Rate Average', 'walkhr'], ['Respiratory Rate', 'resp'], ['Blood Oxygen', 'spo2'],
];

function exportCsv(a) {
  const cols = ['date', 'symptom', ...SYMPTOMS.map((s) => s.key), 'pem', 'screen_hours', 'phone_hours', 'laptop_hours', 'social', 'mental', 'stress', 'rests',
    'rhr', 'hrv', 'hr', 'sleep_min', 'deep_min', 'rem_min', 'nap_min', 'steps', 'exercise', 'energy', 'phone_min', 'laptop_min', 'hr_above_min', 'notes'];
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = a.days.map((d) => cols.map((c) => {
    if (c === 'symptom') return d.symptom == null ? '' : d.symptom.toFixed(1);
    if (d.checkin && c in d.checkin) return esc(d.checkin[c]);
    return esc(d[c]);
  }).join(','));
  const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `progress-${a.today}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResearchCheck({ onRun }) {
  const [state, setState] = useState('');
  return (
    <>
      <button className="secondary" disabled={state === 'running'} onClick={async () => {
        setState('running');
        try { const r = await onRun(); setState(r.added ? `Added ${r.added} new ${r.added === 1 ? 'update' : 'updates'} — see Insights.` : 'Nothing new found.'); }
        catch (e) { setState(e.message); }
      }}>{state === 'running' ? 'Searching… (up to a minute)' : 'Check for new research now'}</button>
      {state && state !== 'running' && <p className="muted small">{state}</p>}
    </>
  );
}

export default function Settings({ token, onToken, demo, onDemo, data, a, onResearchRefresh, demoOnly }) {
  const [draft, setDraft] = useState(token);
  const [generated, setGenerated] = useState('');
  const origin = demoOnly || typeof window === 'undefined' ? 'https://your-app.vercel.app' : window.location.origin;
  const auth = `Bearer ${token || 'YOUR-TOKEN'}`;
  const recent = a.days.slice(-7);
  const has = (k) => recent.some((d) => d[k] != null);
  const checks = [['Resting HR', 'rhr'], ['HRV', 'hrv'], ['Sleep', 'sleep_min'], ['Steps', 'steps'], ['Brisk movement', 'exercise'], ['Active energy', 'energy']];

  const makeToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setGenerated(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  };

  return (
    <div className="screen">
      <header className="top"><div><div className="eyebrow">Connection & setup</div><h1>Settings</h1></div></header>

      {!demoOnly && <section className="card">
        <div className="card-head"><h3>Your token</h3></div>
        <p className="muted small">The same secret goes in Vercel (as PROGRESS_TOKEN), here, and in each shortcut. It keeps your health data private.</p>
        <div className="token-row">
          <input type="password" value={draft} placeholder="Paste your token" onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
          <button className="primary small" onClick={() => onToken(draft.trim())} disabled={draft.trim() === token}>Save</button>
        </div>
        {!token && (
          <div className="gen">
            <button className="link-btn" onClick={makeToken}>Generate a new token</button>
            {generated && <Copy text={generated} label="token" />}
          </div>
        )}
        <label className="toggle-row">
          <div><strong>Show sample data</strong><span className="muted small">Explore the app before your watch is connected</span></div>
          <input type="checkbox" className="switch" checked={demo || !token} disabled={!token} onChange={(e) => onDemo(e.target.checked)} />
        </label>
      </section>}

      {token && !demo && (
        <section className="card">
          <div className="card-head"><h3>Data received (last 7 days)</h3></div>
          <div className="checks">
            {checks.map(([l, k]) => <span key={k} className={has(k) ? 'ok' : 'missing'}>{has(k) ? '✓' : '·'} {l}</span>)}
          </div>
          {data?.syncs?.length > 0 && <p className="muted small">Last sync {new Date(data.syncs[0].at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {data.syncs[0].lines} readings</p>}
        </section>
      )}

      <section className="card">
        <div className="card-head"><h3>Set up the shortcuts</h3></div>
        <p className="muted small">Build these once in the Shortcuts app on your iPhone. Everything you need to paste is here — tap to copy.</p>

        <Guide title="1 · Progress Sync" sub="Reads your watch data from Apple Health and sends it here" open={!token}>
          <p>No loops or variables: each health type is just two actions — find the samples, send them.</p>
          <ol>
            <li>In Shortcuts, tap <b>+</b> and name it <b>Progress Sync</b>.</li>
            <li>Add <b>Find Health Samples</b>. Type: <b>Resting Heart Rate</b>. Tap <b>Add Filter</b> → <b>Start Date</b> · <b>is in the last</b> · <b>3 days</b>. Set <b>Group By</b> to <b>Day</b>.</li>
            <li>Add <b>Get Contents of URL</b> straight after it. URL:
              <Copy text={`${origin}/api/ingest`} label="sync URL" />
              Tap the arrow to show more. Method <b>POST</b>. Under Headers tap <b>Add new header</b>: key <code>Authorization</code>, value:
              <Copy text={auth} label="authorization header" />
              Request Body <b>JSON</b>. Add four <b>Text</b> fields:
              <ul className="sub">
                <li><code>type</code> → type <code>rhr</code></li>
                <li><code>values</code> → tap the value box, tap <b>Select Variable</b>, tap the <b>Health Samples</b> above. Tap the blue token and choose <b>Value</b>.</li>
                <li><code>starts</code> → Health Samples again → tap the token → <b>Start Date</b>.</li>
                <li><code>ends</code> → Health Samples again → tap the token → <b>End Date</b>.</li>
              </ul>
            </li>
            <li>Add <b>Show Result</b> and run it. You should see <b>“Synced … readings”</b>. If it says <i>Nothing received</i>, check Settings › Privacy &amp; Security › Health › Shortcuts has access turned on.</li>
            <li>Now add a pair for each type below. For each: add a new <b>Find Health Samples</b> at the bottom, then long-press the Get Contents of URL → <b>Duplicate</b> and drag the copy under it. In the copy, change <code>type</code>, then <b>re-pick all three blue tokens</b> so they point at the new Health Samples (tap each → Clear → Select Variable).
              <table className="types">
                <thead><tr><th>Health type</th><th><code>type</code></th><th>Group by</th></tr></thead>
                <tbody>{HEALTH_TYPES.map(([t, c, g]) => <tr key={c}><td>{t}</td><td><code>{c}</code></td><td>{g}</td></tr>)}</tbody>
              </table>
              <span className="muted small">Sleep Analysis and Heart Rate (<code>hrs</code>) use Group By <b>None</b>. Set the <code>hrs</code> one to <b>last 1 day</b> only — it sends every reading so Progress can find spikes.</span>
            </li>
            <li>Keep <b>Show Result</b> at the very end while testing, then delete it so the automations run silently.</li>
          </ol>
          <p className="muted small">Optional — answer spike prompts during the sync: after the last Get Contents of URL add <b>Get Dictionary Value</b> (key <code>untagged</code>) → <b>Repeat with Each</b> → inside: <b>List</b> ({TAGS.map((t) => t.label).join(', ')}) → <b>Choose from List</b> → <b>Get Contents of URL</b> <code>{origin}/api/tag</code> (POST, same header, JSON <code>id</code> = Repeat Item’s <code>id</code>, <code>tag</code> = Chosen Item). Or just tag them on the Today screen.</p>
          </ol>
          <div className="tip"><b>First run — bring in your history.</b> Temporarily change every “last 3 days” to <b>last 90 days</b>, run once (it may take a minute), then change them back. Progress will have a baseline straight away.</div>
        </Guide>

        <Guide title="2 · Automations" sub="How often to sync, and why">
          <p>Three syncs a day is enough. Each one re-sends the last three days, so a missed run is filled in by the next.</p>
          <table className="types">
            <thead><tr><th>When</th><th>Trigger</th><th>Why</th></tr></thead>
            <tbody>
              <tr><td>Waking</td><td>Sleep → <b>Waking Up</b></td><td>Last night’s sleep, overnight HRV and resting HR set today’s status</td></tr>
              <tr><td>13:00</td><td>Time of Day</td><td>Steps so far vs your envelope, while there’s time to pace</td></tr>
              <tr><td>21:00</td><td>Time of Day</td><td>Completes the day’s activity before you check in</td></tr>
            </tbody>
          </table>
          <ol>
            <li>Shortcuts → <b>Automation</b> → <b>+</b> → choose the trigger.</li>
            <li>Pick <b>Run Immediately</b> and switch off <b>Notify When Run</b>.</li>
            <li>Next → <b>Progress Sync</b>.</li>
          </ol>
          <p><b>Optional — catch spikes sooner:</b> add two more Time of Day automations (e.g. 10:30 and 16:00) running Progress Sync. Each only adds a few seconds, and means you’re asked about a spike within a few hours rather than at the evening sync.</p>
          <div className="tip">Apple Health is locked while your iPhone is locked, so a run that fires while it’s locked can fail. That’s why the morning one uses Waking Up (you’re usually holding your phone).</div>
        </Guide>

        <Guide title="3 · Progress Log" sub="One-tap energy check on your Apple Watch" icon={<WatchIcon />}>
          <ol>
            <li>New shortcut <b>Progress Log</b>. Add <b>List</b> with: <code>10 – Great</code>, <code>8 – Good</code>, <code>6 – OK</code>, <code>4 – Low</code>, <code>2 – Very low</code>, <code>0 – Wiped out</code>.</li>
            <li>Add <b>Choose from List</b>, prompt “Energy right now?”.</li>
            <li>Add <b>Get Contents of URL</b>:
              <Copy text={`${origin}/api/quick`} label="log URL" />
              Method <b>POST</b>, header <b>Authorization</b> as above, Request Body <b>JSON</b> with Text field <b>energy</b> = <b>Chosen Item</b>.</li>
            <li>Add <b>Show Result</b>.</li>
            <li>Tap <b>ⓘ</b> → switch on <b>Show on Apple Watch</b>. Add the Shortcuts complication to your watch face for one tap.</li>
          </ol>
          <div className="tip">Use it whenever you notice a dip. On days you don’t do a full check-in, these logs stand in for your symptom score.</div>
        </Guide>

        <Guide title="4 · Progress Tag" sub="Tap what you’re doing when your heart rate is up" icon={<WatchIcon />}>
          <ol>
            <li>New shortcut <b>Progress Tag</b>. Add <b>List</b> with the same items as above.</li>
            <li>Add <b>Choose from List</b>, prompt “What’s raising your heart rate?”.</li>
            <li>Add <b>Get Contents of URL</b>: <Copy text={`${origin}/api/tag`} label="tag URL" /> Method POST, Authorization header, Request Body JSON with Text field <b>tag</b> = <b>Chosen Item</b>.</li>
            <li>Add <b>Show Result</b>, then switch on <b>Show on Apple Watch</b> and add it to your watch face.</li>
          </ol>
          <div className="tip">Use it when your watch shows a high heart rate, or you feel it. If a spike is found in the 30 minutes before, it’s tagged straight away; otherwise it’s matched at the next sync.</div>
        </Guide>

        <Guide title="5 · Progress Status" sub="Today’s guidance on your wrist" icon={<WatchIcon />}>
          <ol>
            <li>New shortcut <b>Progress Status</b>. Add <b>Get Contents of URL</b>:
              <Copy text={`${origin}/api/status`} label="status URL" />
              Method <b>GET</b>, header <b>Authorization</b> as above.</li>
            <li>Add <b>Show Result</b>, then switch on <b>Show on Apple Watch</b>.</li>
          </ol>
          <div className="tip">You can also just say “Hey Siri, Progress Status”.</div>
        </Guide>

        <Guide title="6 · Phone screen time (automatic)" sub="Logs when you open and close the apps you choose">
          <p>Apple doesn’t let any app or shortcut read your Screen Time figures, so Progress times your apps directly instead.</p>
          <ol>
            <li>Shortcuts → <b>Automation</b> → <b>+</b> → <b>App</b>. Tap <b>Choose</b> and select the apps you spend time in (Safari, social apps, YouTube, Mail, messaging, news, streaming…). Tick <b>Is Opened</b> only. <b>Run Immediately</b>, Notify off.</li>
            <li>Action: <b>Get Contents of URL</b> <Copy text={`${origin}/api/screen`} label="screen URL" /> Method POST, Authorization header, Request Body JSON: <code>kind</code> = <code>phone</code>, <code>event</code> = <code>open</code>.</li>
            <li>Make a second automation with the same apps, <b>Is Closed</b> only, and <code>event</code> = <code>close</code>.</li>
          </ol>
          <div className="tip">Each session is capped at 30 minutes in case a close is missed (for example if your phone locks mid-app). Pick the apps you want counted — leave out quick ones like Clock or Wallet. The check-in also lets you correct the figure from Settings › Screen Time.</div>
        </Guide>

        <Guide title="7 · Laptop / work time" sub="Start and stop with a Work Focus, or one tap">
          <p><b>Option A — Work Focus (most automatic).</b></p>
          <ol>
            <li>iPhone Settings → <b>Focus</b> → add a <b>Work</b> Focus. Turn on <b>Share Across Devices</b> so switching it on your Mac or iPad counts too. You can also have it switch on automatically on a schedule.</li>
            <li>Shortcuts → Automation → <b>+</b> → <b>Focus</b> → Work → <b>When Turning On</b> → Run Immediately → Get Contents of URL <Copy text={`${origin}/api/screen`} label="screen URL" /> POST, Authorization header, JSON <code>kind</code> = <code>laptop</code>, <code>event</code> = <code>start</code>.</li>
            <li>Same again with <b>When Turning Off</b> and <code>event</code> = <code>stop</code>.</li>
          </ol>
          <p><b>Option B — one tap.</b> New shortcut <b>Laptop</b>: Get Contents of URL as above with <code>event</code> = <code>toggle</code>, then Show Result. Add it to your watch face or Home Screen; tap once to start, again to stop (“Laptop time stopped — 1h 45m”).</p>
          <div className="tip">A forgotten session stops counting after 10 hours. Today’s plan shows how long the laptop has been on and nudges you to break after 45 minutes.</div>
        </Guide>

        <Guide title="8 · Add Progress to your Home Screen" sub="So it opens like an app">
          <ol>
            <li>Open this page in <b>Safari</b> on your iPhone.</li>
            <li>Tap <b>Share</b> → <b>Add to Home Screen</b>.</li>
            <li>Open it from the icon and paste your token above.</li>
          </ol>
        </Guide>
      </section>

      {token && !demo && (
        <section className="card">
          <div className="card-head"><h3>Research updates</h3></div>
          <p className="muted small">On the 1st of each month Progress searches for new pacing and long COVID research and adds plain-English summaries to Insights. It never changes your thresholds on its own — anything that might is flagged for you.</p>
          <ResearchCheck onRun={onResearchRefresh} />
        </section>
      )}

      {!demoOnly && <section className="card">
        <div className="card-head"><h3>Your data</h3></div>
        <p className="muted small">Stored only in your own Supabase database. Export a spreadsheet to take to appointments.</p>
        <button className="secondary" onClick={() => exportCsv(a)}>Export CSV</button>
      </section>}

      <p className="muted small center">Progress v0.1 · not a medical device</p>
    </div>
  );
}
