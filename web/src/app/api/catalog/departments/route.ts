import { ensureDbSetup, getDb, toPublic } from '@/lib/db';
import { jsonOk } from '@/lib/http';

export async function GET() {
  await ensureDbSetup();
  const db = await getDb();
  const departments = await db.collection('departments').find().sort({ code: 1 }).toArray();
  return jsonOk(departments.map((entry) => toPublic(entry)));
}
