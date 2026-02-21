import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/auth';
import { jsonOk } from '@/lib/http';

export async function POST() {
  (await cookies()).set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0,
  });
  return jsonOk({ message: 'Logged out' });
}
