import { createContext, useContext, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import type { ReactNode } from 'react';
import type { Role, UserToken } from '../types';

type AuthCtx = {
  token: string | null;
  role: Role | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const role = useMemo(() => {
    if (!token) return null;
    return jwtDecode<UserToken>(token).role;
  }, [token]);

  const value: AuthCtx = {
    token,
    role,
    login: (newToken) => {
      localStorage.setItem('token', newToken);
      setToken(newToken);
    },
    logout: () => {
      localStorage.removeItem('token');
      setToken(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
