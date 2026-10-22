import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyse } from './lib/analysis.js';
import { makeDemoData } from './lib/demo.js';
import { fetchData, saveCheckin, refreshResearch, reviewResearch, tagSpike, getToken, setToken, getDemoPref, setDemoPref, post } from './lib/api.js';
import { isNative, syncHealth, connectHealth, lastNativeSync } from './lib/native.js';
import { localDate } from './lib/time.js';
import { startReveal } from './lib/reveal.js';
import Today from './components/Today.jsx';
import LogView from './components/LogView.jsx';
import Insights from './components/Insights.jsx';
import Settings from './components/Settings.jsx';
import { TodayIcon, LogIcon, InsightsIcon, SettingsIcon } from './components/Icons.jsx';

export const DEMO_ONLY = import.meta.env.VITE_DEMO_ONLY === '1';

const TABS = [
  { id: 'today', label: 'Today', Icon: TodayIcon },
  { id: 'log', label: 'Check in', Icon: LogIcon },
  { id: 'insights', label: 'Insights', Icon: InsightsIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export default function App() {
  const today = localDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  // A link like https://…/#token=XXXX saves the token and tidies the address bar.
  const [token, setTok] = useState(() => {
    try {
      const m = /[#&]token=([^&]+)/.exec(window.location.hash);
      if (m) { setToken(decodeURIComponent(m[1])); history.replaceState(null, '', window.location.pathname); }
    } catch { /* ignore */ }
    return getToken();
  });
  const [demoPref, setDemo] = useState(getDemoPref());
  const demo = DEMO_ONLY || demoPref || !token;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('today');
  const [logDate, setLogDate] = useState(today);
  const [logMode, setLogMode] = useState(null);

  const load = useCallback(async () => {
    setError('');
    if (demo) { setData(makeDemoData(today)); return; }
    setLoading(true);
    try { setData(await fetchData()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [demo, today]);

  useEffect(() => startReveal(), []);
  // Native app: read Apple Health / Health Connect directly (no Shortcuts needed).
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const nativeSync = useCallback(async ({ force = false } = {}) => {
    if (!isNative() || demo || !token) return;
    const last = lastNativeSync();
    if (!force && last && Date.now() - new Date(last.at) < 15 * 60e3) return;
    setSyncing(true); setSyncNote('');
    try {
      const r = await syncHealth(post, { days: last ? 4 : 90 });
      setSyncNote(`Read ${r.readings.toLocaleString('en-GB')} readings from ${r.days === 90 ? 'the last 90 days' : 'the last few days'}.`);
      await load();
    } catch (e) { setSyncNote(e.message); }
    finally { setSyncing(false); }
  }, [demo, token, load]);
  const onConnectHealth = async () => { await connectHealth(); await nativeSync({ force: true }); };
  useEffect(() => { nativeSync(); }, [nativeSync]);
  useEffect(() => {
    if (!isNative()) return;
    const onVis = () => { if (document.visibilityState === 'visible') nativeSync(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [nativeSync]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && !demo) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load, demo]);

  const analysis = useMemo(() => (data ? analyse(data, today) : null), [data, today]);
  const emptyAnalysis = useMemo(() => analyse({ metrics: [], checkins: [], quick: [] }, today), [today]);

  const onSaveCheckin = async (checkin) => {
    if (demo) {
      setData((d) => ({ ...d, checkins: [...d.checkins.filter((c) => c.date !== checkin.date), { ...(d.checkins.find((c) => c.date === checkin.date) || {}), ...checkin }] }));
      return;
    }
    await saveCheckin(checkin);
    await load();
  };

  const onReview = async (id) => {
    if (demo) return;
    setData((d) => ({ ...d, research: (d.research || []).map((r) => (r.id === id ? { ...r, reviewed: true } : r)) }));
    try { await reviewResearch(id); } catch { /* will retry next load */ }
  };
  const onResearchRefresh = async () => {
    const r = await refreshResearch();
    await load();
    return r;
  };

  const onTag = async (id, tag) => {
    setData((d) => ({ ...d, hr_events: (d.hr_events || []).map((e) => (e.id === id ? { ...e, tag } : e)) }));
    if (!demo) await tagSpike(id, tag);
  };

  const onToken = (t) => { setToken(t); t = getToken(); setTok(t); setError(''); if (t) { setDemoPref(false); setDemo(false); } };
  const onDemo = (on) => { setDemoPref(on); setDemo(on); };
  const goLog = (date = today, mode = null) => { setLogDate(date); setLogMode(mode); setTab('log'); window.scrollTo(0, 0); };

  return (
    <div className="app">
      <main className="main">
        {demo && tab !== 'settings' && (
          <button className="demo-banner" onClick={() => setTab('settings')}>
            {DEMO_ONLY ? 'Demo with sample data — your own data appears once Progress is deployed' : 'Showing sample data — connect your watch in Settings'}
          </button>
        )}
        {error && (
          <div className="error-banner">
            {/token/i.test(error)
              ? <>Your saved token doesn’t match the one in Vercel. <button className="link-btn" onClick={() => setTab('settings')}>Re-enter it in Settings</button></>
              : <>Couldn’t load your data: {error}</>}
          </div>
        )}
        {tab === 'settings' && !analysis ? (
          <Settings token={token} onToken={onToken} demo={demoPref} onDemo={onDemo} data={data} a={emptyAnalysis} onResearchRefresh={onResearchRefresh} demoOnly={DEMO_ONLY} native={{ on: isNative(), syncing, note: syncNote, onConnect: onConnectHealth, onSync: () => nativeSync({ force: true }) }} />
        ) : !analysis ? (
          <div className="loading">{loading ? 'Loading…' : ''}</div>
        ) : (
          <>
            {tab === 'today' && <Today a={analysis} data={data} onCheckIn={goLog} onRefresh={load} loading={loading || syncing} onTag={onTag} onSync={isNative() ? () => nativeSync({ force: true }) : null} />}
            {tab === 'log' && <LogView a={analysis} date={logDate} setDate={setLogDate} mode={logMode} setMode={setLogMode} today={today} onSave={onSaveCheckin} />}
            {tab === 'insights' && <Insights a={analysis} research={data?.research} onReview={onReview} demo={demo} />}
            {tab === 'settings' && <Settings token={token} onToken={onToken} demo={demoPref} onDemo={onDemo} data={data} a={analysis} onResearchRefresh={onResearchRefresh} demoOnly={DEMO_ONLY} native={{ on: isNative(), syncing, note: syncNote, onConnect: onConnectHealth, onSync: () => nativeSync({ force: true }) }} />}
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => { setTab(id); window.scrollTo(0, 0); }} aria-current={tab === id ? 'page' : undefined}>
            <i className="tab-ico"><Icon /></i>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
