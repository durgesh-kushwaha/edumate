import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Role } from './types';

export const AUTH_COOKIE = 'eduvision_token';

const JWT_SECRET = process.env.JWT_SECRET || 'eduvision-local-secret';

export type AuthPayload = {
  sub: string;
  role: Role;
  email: string;
};

export function hashPassword(raw: string) {
  return bcrypt.hashSync(raw, 10);
}

export function verifyPassword(raw: string, hashed: string) {
  return bcrypt.compareSync(raw, hashed);
}

export function signToken(payload: AuthPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}
