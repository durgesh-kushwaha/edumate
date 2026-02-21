export type Role = 'superadmin' | 'admin' | 'teacher' | 'student';

export type PublicUser = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
};
