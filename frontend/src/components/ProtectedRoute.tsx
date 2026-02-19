import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

export default function ProtectedRoute({ children, roles }: { children: JSX.Element; roles: Role[] }) {
  const { token, role } = useAuth();
  if (!token || !role) return <Navigate to="/login" replace />;
  if (!roles.includes(role)) return <Navigate to="/login" replace />;
  return children;
}
