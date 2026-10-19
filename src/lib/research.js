// The evidence base behind Progress's thresholds and advice.
// Reviewed 18 Oct 2026. New research is pulled in monthly by /api/research-refresh
// and shown in the app; thresholds below only change when you choose to update this file.

export const REVIEWED = '2026-10-18';

// How each rule in analysis.js is grounded.
export const PRINCIPLES = [
  {
    id: 'delay',
    title: 'Crashes lag behind the effort',
    body: 'Symptoms after exertion often worsen 12–48 hours later and can last days or weeks. Progress looks back three days when judging today, and judges activity by how you felt over the following two days.',
    sources: ['worldphysio2021'],
  },
  {
    id: 'symptom-led',
    title: 'Pace by symptoms, not quotas',
    body: 'Guidance favours symptom-contingent pacing — staying inside your energy envelope and resting before you’re tired — over graded exercise or fixed activity targets. Your envelope is a ceiling to stay under, never a target to hit.',
    sources: ['worldphysio2021', 'nice206'],
  },
  {
    id: 'all-exertion',
    title: 'Thinking and socialising count',
    body: 'Cognitive, emotional and social effort can trigger post-exertional malaise as well as physical activity, which is why the check-in records screen time, mental load, social contact and stress.',
    sources: ['worldphysio2021'],
  },
  {
    id: 'hr-ceiling',
    title: 'A conservative heart-rate ceiling',
    body: 'A common starting point is resting heart rate + 15 bpm: avoid more than a couple of minutes above it, and rest until you’re back within about 10 bpm of resting. Treat it as an estimate — lower it if crashes still follow days spent under it. A 2026 trial that allowed 30 minutes a day above 60% of age-predicted maximum showed no benefit over control, and critics argue that limit was too high.',
    sources: ['workwell', 'paceme2026', 'risingtides2026'],
  },
  {
    id: 'hrv',
    title: 'HRV shows how recovered you are',
    body: 'In long COVID, HRV can stay suppressed for up to 24 hours after even mild exercise, and longer sessions (over an hour) lower HRV more the following night than short ones. A morning HRV well below your normal is treated as a sign you haven’t recovered — and activity is best broken into short bouts.',
    sources: ['ruijgt2026'],
  },
  {
    id: 'personal',
    title: 'Personal, conservative, timely',
    body: 'Wearable-guided pacing has proved safe and helps people understand their limits, but in the largest trial so far it did not reduce PEM more than a dummy app. The best current advice is that pacing should be personalised and conservative, with feedback kept light to avoid overload. Progress uses your own history, not population averages, and only shows alerts once a day.',
    sources: ['paceme2026', 'sanalhayes2026', 'visible2025'],
  },
];

export const RED_FLAGS = [
  'Chest pain, or breathlessness out of proportion to what you’re doing',
  'Blood oxygen dropping 3% or more when you exert yourself',
  'Fainting, near-fainting, or palpitations — especially if your heart rate jumps 30+ bpm when you stand',
  'Resting heart rate staying well above your normal for several days',
];

export const SOURCES = {
  worldphysio2021: { label: 'World Physiotherapy — Safe rehabilitation approaches for people living with Long COVID (2021)', url: 'https://world.physio/sites/default/files/2021-07/Briefing-Paper-9-Long-Covid-FINAL-English-202107.pdf' },
  nice206: { label: 'NICE NG206 — ME/CFS diagnosis and management (2021)', url: 'https://www.nice.org.uk/guidance/ng206' },
  nice188: { label: 'NICE/SIGN/RCGP NG188 — Managing the long-term effects of COVID-19', url: 'https://www.nice.org.uk/guidance/ng188' },
  workwell: { label: 'Workwell Foundation heart-rate pacing guidance (summarised by Welltory, 2026)', url: 'https://welltory.com/blog/heart-rate-pacing' },
  ruijgt2026: { label: 'Ruijgt et al. — Wearable HRV monitoring and PEM thresholds in Long COVID (2025 preprint)', url: 'https://www.medrxiv.org/content/10.1101/2025.03.18.25320115.full.pdf' },
  paceme2026: { label: 'Hayes, Sanal-Hayes, Sculthorpe et al. — PaceMe randomised trial, Nature Communications (2026)', url: 'https://www.news-medical.net/news/20260202/Study-tests-digital-energy-management-tool-for-Long-COVID.aspx' },
  sanalhayes2026: { label: 'Sanal-Hayes et al. — Pacing and energy management with digital tools, PLOS Digital Health (Jul 2026)', url: 'https://journals.plos.org/digitalhealth/article?id=10.1371%2Fjournal.pdig.0001586' },
  risingtides2026: { label: 'Rising Tides — The pacing threshold problem in Long Covid (2026)', url: 'https://risingtidesrecovery.substack.com/p/the-pacing-threshold-problem-in-long' },
  visible2025: { label: 'Visible — survey of 1,300 users and HR-pacing feasibility RCT (2025)', url: 'https://www.makevisible.com/blog/first-two-visible-studies-published-building-the-science-of-wearables-and-pacing-together' },
};

// General, evidence-based moves — used when your own history doesn't have enough yet.
export const GENERAL_ADVICE = {
  amber: [
    'Cut planned activity back, and split what’s left into short bouts with rest in between.',
    'Rest before you feel tired, not after — lying down with eyes closed counts most.',
    'Lighten the mental and social load too: fewer screens, shorter conversations.',
    'Keep heart rate under your ceiling; sit or lie down until it settles.',
  ],
  red: [
    'Stop. Rest. Pace — clear the day of anything that can wait.',
    'Keep any activity to the minimum and break it up with rest.',
    'Reduce screens, noise and conversation; protect sleep tonight.',
    'Don’t try to “push through” — and avoid catching up in the days after you feel better.',
  ],
};
