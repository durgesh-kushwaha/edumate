export type Role = 'admin' | 'teacher' | 'student';
export type UserToken = { role: Role; sub: string; exp: number };
