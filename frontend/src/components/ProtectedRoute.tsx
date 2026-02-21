import type { ReactElement } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

export default function ProtectedRoute({ children, roles }: { children: ReactElement; roles: Role[] }) {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated || !role) {
    return <Navigate to="/auth" replace />;
  }
  if (!roles.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
