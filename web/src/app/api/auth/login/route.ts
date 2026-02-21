import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { AUTH_COOKIE, signToken, verifyPassword } from '@/lib/auth';
import { ensureDbSetup, getDb, oid, toPublic } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    await ensureDbSetup();
    const body = (await request.json()) as { email?: string; password?: string };
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    if (!email || !password) {
      return jsonError('Email and password are required', 400);
    }

    const db = await getDb();
    const user = await db.collection('users').findOne({ email, is_active: true });
    if (!user || !verifyPassword(password, String(user.hashed_password || ''))) {
      return jsonError('Invalid email or password', 401);
    }

    const token = signToken({
      sub: user._id.toString(),
      email: String(user.email),
      role: user.role,
    });

    (await cookies()).set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 12,
    });

    let profile: unknown = null;
    if (user.role === 'student') {
      profile = await db.collection('students').findOne({ user_id: oid(user._id.toString()) });
    }
    if (user.role === 'teacher') {
      profile = await db.collection('faculty').findOne({ user_id: oid(user._id.toString()) });
    }

    return jsonOk({
      user: toPublic(user),
      profile: toPublic(profile),
      token_type: 'cookie',
    });
  } catch {
    return jsonError('Unable to login', 500);
  }
}
