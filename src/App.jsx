import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyse } from './lib/analysis.js';
import { makeDemoData } from './lib/demo.js';
import { fetchData, saveCheckin, refreshResearch, reviewResearch, tagSpike, getToken, setToken, getDemoPref, setDemoPref } from './lib/api.js';
import { localDate } from './lib/time.js';
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
  const [token, setTok] = useState(getToken());
  const [demoPref, setDemo] = useState(getDemoPref());
  const demo = DEMO_ONLY || demoPref || !token;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('today');
  const [logDate, setLogDate] = useState(today);

  const load = useCallback(async () => {
    setError('');
    if (demo) { setData(makeDemoData(today)); return; }
    setLoading(true);
    try { setData(await fetchData()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [demo, today]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && !demo) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load, demo]);

  const analysis = useMemo(() => (data ? analyse(data, today) : null), [data, today]);

  const onSaveCheckin = async (checkin) => {
    if (demo) {
      setData((d) => ({ ...d, checkins: [...d.checkins.filter((c) => c.date !== checkin.date), checkin] }));
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

  const onToken = (t) => { setToken(t); setTok(t); if (t) { setDemoPref(false); setDemo(false); } };
  const onDemo = (on) => { setDemoPref(on); setDemo(on); };
  const goLog = (date = today) => { setLogDate(date); setTab('log'); window.scrollTo(0, 0); };

  return (
    <div className="app">
      <main className="main">
        {demo && tab !== 'settings' && (
          <button className="demo-banner" onClick={() => setTab('settings')}>
            {DEMO_ONLY ? 'Demo with sample data — your own data appears once Progress is deployed' : 'Showing sample data — connect your watch in Settings'}
          </button>
        )}
        {error && <div className="error-banner">Couldn’t load your data: {error}</div>}
        {!analysis ? (
          <div className="loading">{loading ? 'Loading…' : ''}</div>
        ) : (
          <>
            {tab === 'today' && <Today a={analysis} data={data} onCheckIn={goLog} onRefresh={load} loading={loading} onTag={onTag} />}
            {tab === 'log' && <LogView a={analysis} date={logDate} setDate={setLogDate} today={today} onSave={onSaveCheckin} />}
            {tab === 'insights' && <Insights a={analysis} research={data?.research} onReview={onReview} demo={demo} />}
            {tab === 'settings' && <Settings token={token} onToken={onToken} demo={demoPref} onDemo={onDemo} data={data} a={analysis} onResearchRefresh={onResearchRefresh} demoOnly={DEMO_ONLY} />}
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => { setTab(id); window.scrollTo(0, 0); }} aria-current={tab === id ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
