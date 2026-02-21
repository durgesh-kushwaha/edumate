import { ensureDbSetup, getDb, toPublic } from '@/lib/db';
import { jsonOk } from '@/lib/http';

const DEPARTMENTS_CACHE_TTL_MS = 5 * 60 * 1000;
const globalForCatalogCache = globalThis as unknown as {
  departmentsCache?: {
    expiresAt: number;
    payload: unknown[];
  };
};

export async function GET() {
  const cached = globalForCatalogCache.departmentsCache;
  if (cached && cached.expiresAt > Date.now()) {
    return jsonOk(cached.payload);
  }

  await ensureDbSetup();
  const db = await getDb();
  const departments = await db.collection('departments').find().sort({ code: 1 }).toArray();
  const payload = departments.map((entry) => toPublic(entry));
  globalForCatalogCache.departmentsCache = {
    expiresAt: Date.now() + DEPARTMENTS_CACHE_TTL_MS,
    payload,
  };
  return jsonOk(payload);
}
