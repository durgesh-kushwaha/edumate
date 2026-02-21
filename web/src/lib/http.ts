import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, verifyToken } from './auth';
import { ensureDbSetup, getDb, oid, toPublic } from './db';
import type { Role } from './types';

export function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function currentUser() {
  await ensureDbSetup();
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const payload = verifyToken(token);
  if (!payload) {
    return null;
  }
  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: oid(payload.sub), is_active: true });
  if (!user) {
    return null;
  }
  return user;
}

export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  if (roles && !roles.includes(user.role as Role)) {
    throw new Error('FORBIDDEN');
  }
  return user;
}

export function safeUser(user: Record<string, unknown>) {
  return toPublic(user) as { id: string; full_name: string; email: string; role: Role };
}
