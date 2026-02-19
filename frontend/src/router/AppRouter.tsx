import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import DashboardLayout from '../layouts/DashboardLayout';
import DashboardSwitch from '../pages/DashboardSwitch';
import AttendancePage from '../pages/AttendancePage';
import MarksPage from '../pages/MarksPage';
import ProtectedRoute from '../components/ProtectedRoute';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'student']}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<DashboardSwitch />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="marks" element={<MarksPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
