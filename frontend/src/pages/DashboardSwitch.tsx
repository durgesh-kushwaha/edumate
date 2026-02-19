import AdminDashboard from './AdminDashboard';
import TeacherDashboard from './TeacherDashboard';
import StudentDashboard from './StudentDashboard';
import { useAuth } from '../context/AuthContext';

export default function DashboardSwitch() {
  const { role } = useAuth();
  if (role === 'admin') return <AdminDashboard />;
  if (role === 'teacher') return <TeacherDashboard />;
  return <StudentDashboard />;
}
