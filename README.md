# Progress

A personal pacing and recovery tracker for long Covid. It reads Apple Watch data through iOS Shortcuts, combines it with a one-minute daily check-in, and learns your own baseline. From that it works out when to rest, how long recovery takes, and what tends to come before a crash.

**Stack:** React + Vite (PWA) · Vercel serverless functions (`/api`) · Supabase (Postgres)

---

## Deploy (about 15 minutes)

### 1. Supabase
1. Create a new project at supabase.com. Name it `progress` and choose region London.
2. Go to **SQL Editor → New query**, paste in `supabase/schema.sql` and click **Run**.
3. Go to **Project Settings → API** and copy two values: the **Project URL** and the **service_role** key (the secret one).

### 2. GitHub
Create a repo called `progress` and upload the contents of this folder (**Add file → Upload files**, then drag everything in).

### 3. Vercel
1. Go to **Add New → Project** and import the repo. Vercel detects Vite automatically.
2. Before deploying, add these **Environment Variables**:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
| `PROGRESS_TOKEN` | A long random secret. To get one, open the deployed app → Settings → *Generate a new token*, or use any password generator. |
| `PROGRESS_TZ` | *(optional)* defaults to `Europe/London` |
| `ANTHROPIC_API_KEY` | From console.anthropic.com — powers the monthly research update (about 10–30p a run) |
| `CRON_SECRET` | Any random string — Vercel uses it to authenticate the monthly cron |

3. Click **Deploy**. If you only set the token after the first deploy, redeploy so it takes effect.

### 4. iPhone
1. Open the app URL in Safari, then tap **Share → Add to Home Screen**.
2. Open Progress → **Settings** and paste your token.
3. Follow the in-app guides to build the shortcuts. They show your real URLs and token with copy buttons:
   - **Progress Sync**: Health → app, run by 3 automations a day
   - **Progress Log**: one-tap energy level from the Apple Watch
   - **Progress Status**: today's guidance shown on the watch
4. Run Progress Sync once with *last 90 days* to import your history.

---

## How syncing works

The shortcut sends one line per reading:

```
metric|start (ISO 8601)|end (ISO 8601)|value
steps|2026-10-17T00:00:00+01:00|2026-10-18T00:00:00+01:00|6420
sleep|2026-10-17T23:41:00+01:00|2026-10-18T00:12:00+01:00|Core
```

Supported codes are `rhr hrv hr walkhr steps energy exercise resp spo2 sleep`.

- Quantities are grouped by day in the shortcut. Each sync re-sends the last 3 days, and the oldest (possibly partial) day in a batch is ignored. This makes syncs safe to repeat, and a missed run gets filled in by the next one.
- Raw sleep stages are stored. Nightly totals are calculated as the *union* of overlapping sources, so iPhone and Watch together don't double-count. Segments ending between 14:00 and 18:00 count as naps.
- **Sync schedule:** on waking (sleep, overnight HRV, resting HR), 13:00 (pacing during the day) and 21:00 (to complete the day). Apple Health can't be read while the iPhone is locked, which is why the morning sync uses the *Waking Up* trigger.

**Screen time and social interaction** go in the daily check-in. Shortcuts can't read Screen Time data.

## How the analysis works (`src/lib/analysis.js`)

- **Symptom score:** the average of five 0–10 ratings (fatigue, brain fog, breathlessness, aches, palpitations/dizziness), where higher is worse. Watch energy logs (10 − energy) stand in on days without a check-in.
- **Baseline:** the median of your previous 28 days, for each signal.
- **Today's status:** points from resting HR above normal, HRV below normal, a short night, any day in the last 3 that went well over your activity envelope (post-exertional malaise usually lags 24–72h), symptoms above baseline, and a recent crash. The total maps to Green / Amber / Red.
- **Crash:** a day you flag, or symptoms ≥2.5 above baseline (and ≥5). Days are grouped into episodes. Recovery is counted until symptoms return to within 1 point of the pre-crash baseline.
- **Activity envelope:** the step count you can usually do without symptoms rising (≥1.5) or a crash in the next 2–3 days. Only days that *started settled* are used, so rest forced by a crash doesn't distort it.
- **What affects you:** for each factor, symptoms over the next two days after higher days are compared with lower days, using Spearman correlation. Results are labelled *Early pattern* (<30 days) or *Consistent pattern*. These are correlations in your own data, not proof of cause.
- **Crash precursors:** averages over the 3 days before each crash, compared with your normal.

The app shows sample data until a token is saved, so you can explore it straight away.

## Evidence base & research updates

- `src/lib/research.js` holds the evidence each rule is built on (World Physiotherapy 2021, NICE NG206, Workwell HR pacing, Ruijgt et al. HRV study, the 2026 PaceMe RCT and Sanal-Hayes 2026 review), red flags, and general fallback advice. Reviewed 18 Oct 2026.
- On the 1st of every month, Vercel Cron calls `/api/research-refresh`. Claude (with web search) looks for pacing / PEM / wearable research published since the last check and saves plain-English summaries, shown under **Insights → Latest research**. Only items backed by real search results are kept.
- Updates never change thresholds automatically. Anything that suggests a change is flagged so you can decide, then update `research.js` / `analysis.js`.
- You can also run it any time from **Settings → Check for new research now**.

## What's worked for you

Progress replays your history to find past "warning" days (amber or red, starting from a settled day), then checks whether a crash followed within 4 days. It compares what you did over the next two days when you avoided a crash with when you didn't — steps, exercise, screens, social, mental load, sleep and naps — and shows the differences as personal advice on amber/red days. It does the same for crash recovery: what your quicker recoveries had in common in their first three days. Until there's enough history, it falls back to evidence-based advice.

## Daily support (no workouts — ever)

Progress never suggests exercise or building up activity. The envelope is a ceiling; spare room is for things you value.

- **Today's plan** — a step budget scaled to how you are (100% of your envelope on a green day, 70% amber, 50% red, 40–75% in recovery), a marker showing where an even pace would put you by now, how many rest breaks to plan, and up to four suggestions tied to today's signals (short night, low HRV, raised resting HR, a busy, social or screen-heavy yesterday).
- **Recovery mode** — during a crash, Today switches to a three-phase guide (Rest → Ease in → Return gently) with your typical recovery time, and keeps you below your envelope for a couple of days after you recover to avoid boom-and-bust.
- **Things I've noticed** — up to five observations: steady-day trend, crash frequency, short nights, HRV and resting-HR trends, boom-and-bust days, envelope streaks, your busiest weekday, and whether rest breaks or long screen days affect you.
- **Rest breaks** — logged in the check-in (0 / 1–2 / 3–4 / 5+) and included in patterns and "what's worked".
- **Your progress** — Insights compares 4-week blocks: steady days, crashes, symptoms, sleep and HRV.
- Apple's "exercise minutes" are shown as *brisk movement* — something to keep under a limit, not a goal.

## Heart-rate spike tagging

- Progress Sync also sends every heart-rate reading from the last day (`hrs`). The server stores them for 45 days and finds **spikes**: at least two readings at or above your ceiling (resting HR + 15) within 6 minutes, or one reading 15+ bpm over it. Spikes less than 15 minutes apart are merged.
- After each sync, the shortcut gets back up to three untagged spikes and shows a **pick-list** for each: Social, Screens, Driving, Walking / moving, Chores / standing, Shower / dressing, Stress, Eating, Other, Not sure. One tap tags it.
- **Progress Tag** on the Apple Watch logs what you're doing in the moment. It tags a spike from the last 30 minutes, or is matched to one at the next sync.
- Untagged spikes also appear on **Today** with one-tap chips. **Insights → What raises your heart rate** ranks your triggers by time above the ceiling, with a practical idea for the biggest one. Daily *time above ceiling* becomes a factor in "What affects you", "What's worked" and crash precursors.
- **Limitation:** iPhone doesn't let Shortcuts or web apps run the moment your heart rate rises, so prompts arrive at each sync rather than instantly. Real-time pop-ups with buttons would need a native iOS app (a possible v2).

## Screen time: phone vs laptop / work

Apple doesn't expose Screen Time to Shortcuts, the Health app or web apps, so Progress measures it directly:

- **Phone:** two App automations (chosen apps *Is Opened* / *Is Closed*) post to `/api/screen`. Sessions are paired on the server and capped at 30 minutes if a close is missed. They're summed into `phone_min` per day.
- **Laptop / work:** a Work Focus turning on and off (shared across devices), or a one-tap *Laptop* toggle on the watch, gives `laptop_min`. A session that's left running stops counting after 10 hours.
- The check-in has separate Phone and Laptop / work fields, pre-filled from tracked time. You can override them, e.g. from Settings › Screen Time.
- Phone, laptop and total screen time are separate factors in the analysis. A **screen budget** is learned the same way as the step envelope. Today's plan shows phone and laptop time against it, and nudges a break once the laptop has been on for 45 minutes. A heart-rate spike during screen use pre-highlights *Screens* as the tag.

## API

All endpoints need the header `Authorization: Bearer <PROGRESS_TOKEN>`.

| Endpoint | Purpose |
|---|---|
| `POST /api/ingest` | `{"lines": "..."}` from Progress Sync |
| `POST /api/quick` | `{"energy": "6 – OK"}` from the watch |
| `POST /api/checkin` | Daily check-in from the app |
| `GET /api/data` | Everything the app displays |
| `POST /api/research-refresh` | Search for new research now (also run monthly by cron) |
| `POST /api/research-review` | Mark a research update as read |
| `POST /api/screen` | `{"kind":"phone","event":"open"}` / `close`, or `{"kind":"laptop","event":"start"}` / `stop` / `toggle` |
| `POST /api/tag` | `{"id": 42, "tag": "Social"}` tag a spike, or `{"tag": "Driving"}` from the watch |
| `GET /api/status` | Plain-text summary for the watch (`?format=json` for the full object) |

## Ideas for v2
- A Claude-written weekly summary for clinic appointments
- Hourly heart rate to measure how quickly it settles after exertion
- Reminders to rest when the 13:00 sync shows you're near your envelope
- A menstrual cycle, medication or supplement log as extra factors

*Progress is a personal tracking tool, not a medical device.*
