import AdminDashboard from './AdminDashboard';
import StudentDashboard from './StudentDashboard';
import TeacherDashboard from './TeacherDashboard';
import { useAuth } from '../context/AuthContext';

export default function DashboardSwitch() {
  const { role } = useAuth();
  if (role === 'admin' || role === 'superadmin') {
    return <AdminDashboard />;
  }
  if (role === 'teacher') {
    return <TeacherDashboard />;
  }
  return <StudentDashboard />;
}
