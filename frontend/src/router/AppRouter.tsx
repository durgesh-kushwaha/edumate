import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';

const DashboardLayout = lazy(() => import('../layouts/DashboardLayout'));
const AcademicsPage = lazy(() => import('../pages/AcademicsPage'));
const AttendancePage = lazy(() => import('../pages/AttendancePage'));
const CoursesPage = lazy(() => import('../pages/CoursesPage'));
const DashboardSwitch = lazy(() => import('../pages/DashboardSwitch'));
const ExamsPage = lazy(() => import('../pages/ExamsPage'));
const FeesPage = lazy(() => import('../pages/FeesPage'));
const LoginPage = lazy(() => import('../pages/LoginPage'));
const MarksPage = lazy(() => import('../pages/MarksPage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const ResultsPage = lazy(() => import('../pages/ResultsPage'));

function RouteLoader() {
  return <div className="mx-auto mt-8 w-full max-w-7xl rounded-2xl bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">Loading page...</div>;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/auth" element={<LoginPage />} />
          <Route path="/login" element={<Navigate to="/auth" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route
            path="/"
            element={
              <ProtectedRoute roles={['superadmin', 'admin', 'teacher', 'student']}>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<DashboardSwitch />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="academics" element={<AcademicsPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="marks" element={<MarksPage />} />
            <Route path="fees" element={<FeesPage />} />
            <Route path="exams" element={<ExamsPage />} />
            <Route path="exams/results" element={<ResultsPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
