import { getDb, oid, toPublic } from '@/lib/db';
import { currentUser, jsonOk } from '@/lib/http';

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return jsonOk({ user: null }, 200);
  }

  const db = await getDb();
  let profile: unknown = null;
  if (user.role === 'student') {
    profile = await db.collection('students').findOne({ user_id: oid(user._id.toString()) });
  }
  if (user.role === 'teacher') {
    profile = await db.collection('faculty').findOne({ user_id: oid(user._id.toString()) });
  }

  return jsonOk({ user: toPublic(user), profile: toPublic(profile) });
}
