// GET /api/data — everything the app needs (last ~13 months).
import { guard, loadAll, fail } from './_lib.js';

export default async function handler(req, res) {
  if (!guard(req, res, ['GET'])) return;
  try {
    res.status(200).json(await loadAll());
  } catch (err) {
    fail(res, err);
  }
}
