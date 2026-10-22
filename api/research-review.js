// POST /api/research-review  {"id": 12}  — mark a research update as read/reviewed.
import { guard, readBody, db, fail } from './_lib.js';

export default async function handler(req, res) {
  if (!(await guard(req, res, ['POST']))) return;
  try {
    const { id } = readBody(req);
    const { error } = await db().from('research_updates').update({ reviewed: true }).eq('id', Number(id));
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
}
