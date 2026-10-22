// GET /api/data — everything the app needs (last ~13 months).
import { guard, own, loadAll, fail } from './_lib.js';

export default async function handler(req, res) {
  const who = await guard(req, res, ['GET']);
  if (!who) return;
  try {
    res.status(200).json(await loadAll(who));
  } catch (err) {
    fail(res, err);
  }
}
