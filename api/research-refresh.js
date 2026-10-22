// GET/POST /api/research-refresh
// Runs monthly via Vercel Cron (see vercel.json), or on demand from Settings → "Check for new research".
// Asks Claude (with web search) for pacing / long COVID research published since the last check,
// and stores short plain-English summaries. It never changes the app's thresholds by itself:
// anything that suggests a change is flagged for you to review.
import { whoIs, cors, db, fail } from './_lib.js';
import { PRINCIPLES, SOURCES, REVIEWED } from '../src/lib/research.js';

export const maxDuration = 300;

const MODEL = process.env.PROGRESS_RESEARCH_MODEL || 'claude-sonnet-5-5';

function cronOk(req) {
  const secret = process.env.CRON_SECRET;
  return secret && req.headers.authorization === `Bearer ${secret}`;
}

function buildPrompt(since, known) {
  return `You keep a personal long COVID pacing app up to date with research.

The app's current evidence base (reviewed ${REVIEWED}):
${PRINCIPLES.map((p) => `- ${p.title}: ${p.body}`).join('\n')}

Sources already included:
${Object.values(SOURCES).map((s) => `- ${s.label}`).join('\n')}
${known.length ? `\nUpdates already recorded:\n${known.map((k) => `- ${k}`).join('\n')}` : ''}

Search for research, trials, systematic reviews or guideline changes published since ${since} about:
pacing, post-exertional malaise (PEM), energy envelope, heart-rate or HRV-guided pacing, wearables, activity/exercise safety,
and recovery from crashes in long COVID (and ME/CFS where directly relevant). Prefer peer-reviewed journals, NICE, WHO,
NIHR, RECOVER and major clinical bodies. Ignore anything already listed above, opinion pieces without data, and marketing.

Return ONLY a JSON array inside <json></json> tags (empty array if nothing new and credible). Each item:
{"title": string, "source": "journal or body", "published": "YYYY-MM-DD or YYYY-MM", "url": string,
 "summary": "2-3 plain-English sentences on what was found and how strong the evidence is",
 "relevance": "1 sentence on what it means for someone pacing with a wearable",
 "suggests_change": boolean, "change": "if true: which principle/threshold it would affect and how, else empty string"}
Maximum 5 items. Do not invent studies; only include items you found in search results.`;
}

export default async function handler(req, res) {
  if (!cors(req, res)) return;
  if (!cronOk(req)) {
    // Research costs API credit, so only the app's owner can run it on demand:
    // the original token, or the account it has been linked to.
    const who = await whoIs(req).catch(() => null);
    if (!who) return res.status(401).json({ error: 'Please sign in again (wrong or expired token)' });
    let owner = who.via === 'legacy';
    if (!owner && who.userId) {
      const { data } = await db().from('api_tokens').select('kind').eq('user_id', who.userId).eq('kind', 'legacy').limit(1);
      owner = Boolean(data?.length);
    }
    if (!owner) return res.status(403).json({ error: 'Research updates are run by the app owner.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Add ANTHROPIC_API_KEY in Vercel to enable research updates.' });
  try {
    const sb = db();
    const { data: prev, error: prevErr } = await sb.from('research_updates').select('title,checked_at').order('checked_at', { ascending: false }).limit(40);
    if (prevErr) throw prevErr;
    const lastCheck = prev?.length ? prev[0].checked_at.slice(0, 10) : REVIEWED;
    const since = lastCheck < REVIEWED ? lastCheck : REVIEWED;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
        messages: [{ role: 'user', content: buildPrompt(since, (prev || []).map((p) => p.title)) }],
      }),
    });
    if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const msg = await r.json();
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const found = new Set();
    for (const b of msg.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const x of b.content) if (x.url) found.add(x.url);
    }
    const m = /<json>([\s\S]*?)<\/json>/.exec(text);
    let items = [];
    try { items = JSON.parse(m ? m[1] : '[]'); } catch { items = []; }

    const known = new Set((prev || []).map((p) => p.title.toLowerCase()));
    const now = new Date().toISOString();
    const rows = items
      .filter((it) => it && it.title && it.url && found.has(it.url) && !known.has(String(it.title).toLowerCase()))
      .slice(0, 5)
      .map((it) => ({
        checked_at: now,
        title: String(it.title).slice(0, 300),
        source: String(it.source || '').slice(0, 200),
        published: String(it.published || '').slice(0, 20),
        url: String(it.url).slice(0, 500),
        summary: String(it.summary || '').slice(0, 1200),
        relevance: String(it.relevance || '').slice(0, 600),
        suggests_change: Boolean(it.suggests_change),
        change: String(it.change || '').slice(0, 600),
        reviewed: false,
      }));

    if (rows.length) {
      const { error } = await sb.from('research_updates').insert(rows);
      if (error) throw error;
    } else {
      // Record the check so "last checked" stays current.
      await sb.from('research_updates').insert({ checked_at: now, title: `No new research found (${now.slice(0, 10)})`, source: 'check', url: '', summary: '', relevance: '', suggests_change: false, change: '', reviewed: true, is_marker: true });
    }
    res.status(200).json({ ok: true, added: rows.length, items: rows });
  } catch (err) {
    fail(res, err);
  }
}
