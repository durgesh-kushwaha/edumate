import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DashboardLayout() {
  const { role, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <nav className="bg-slate-900 text-white p-4 flex justify-between">
        <div className="font-bold">EduVision Nexus ({role})</div>
        <div className="space-x-4">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/attendance">Attendance</Link>
          <Link to="/marks">Marks</Link>
          <button onClick={logout}>Logout</button>
        </div>
      </nav>
      <main className="p-6"><Outlet /></main>
    </div>
  );
}
