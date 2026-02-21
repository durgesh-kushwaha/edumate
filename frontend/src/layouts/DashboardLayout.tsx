import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

type NavItem = {
  path: string;
  label: string;
  roles: Role[];
};

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', roles: ['superadmin', 'admin', 'teacher', 'student'] },
  { path: '/courses', label: 'Courses', roles: ['superadmin', 'admin', 'teacher', 'student'] },
  { path: '/academics', label: 'Academics', roles: ['superadmin', 'admin', 'teacher', 'student'] },
  { path: '/attendance', label: 'Attendance', roles: ['superadmin', 'admin', 'teacher', 'student'] },
  { path: '/marks', label: 'Marks', roles: ['superadmin', 'admin', 'teacher', 'student'] },
  { path: '/fees', label: 'Fees', roles: ['superadmin', 'admin', 'student'] },
  { path: '/exams', label: 'Exams', roles: ['student'] },
  { path: '/profile', label: 'Profile', roles: ['superadmin', 'admin', 'teacher', 'student'] },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return [
    'rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-cyan-300 text-slate-950 shadow-[0_12px_20px_rgba(34,211,238,0.25)]'
      : 'text-slate-200 hover:bg-white/10 hover:text-white',
  ].join(' ');
}

export default function DashboardLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { role, user, logout } = useAuth();

  const items = useMemo(() => {
    if (!role) {
      return [];
    }
    return NAV_ITEMS.filter((item) => item.roles.includes(role));
  }, [role]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <Link to="/dashboard" className="text-lg font-semibold text-white">
              EduVision Nexus
            </Link>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-300">{role || 'user'} portal</p>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {items.map((item) => (
              <NavLink key={item.path} to={item.path} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
            <button className="soft-btn border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800" onClick={logout}>
              Logout
            </button>
          </div>

          <button className="soft-btn border-slate-700 bg-slate-900/80 text-slate-100 hover:bg-slate-800 md:hidden" onClick={() => setMenuOpen((value) => !value)}>
            Menu
          </button>
        </div>

        {menuOpen ? (
          <div className="border-t border-slate-800 bg-slate-950 px-4 py-3 md:hidden">
            <div className="grid gap-2">
              {items.map((item) => (
                <NavLink key={item.path} to={item.path} className={linkClass} onClick={() => setMenuOpen(false)}>
                  {item.label}
                </NavLink>
              ))}
              <button className="soft-btn border-slate-700 bg-slate-900/80 text-left text-slate-100 hover:bg-slate-800" onClick={logout}>
                Logout
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="surface-card mb-4 rounded-2xl px-4 py-3 text-sm text-slate-700">
          Signed in as <span className="font-semibold text-slate-900">{user?.full_name || user?.email || 'User'}</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
