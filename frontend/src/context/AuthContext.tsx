import { createContext, useContext, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import type { ReactNode } from 'react';
import type { Role, UserProfile, UserToken } from '../types';

type AuthCtx = {
  token: string | null;
  role: Role | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

function clearStoredSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function isTokenValid(token: string | null): token is string {
  if (!token) {
    return false;
  }
  try {
    const decoded = jwtDecode<UserToken>(token);
    const expiresAtMs = decoded.exp * 1000;
    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  } catch {
    return false;
  }
}

function parseStoredUser(): UserProfile | null {
  const raw = localStorage.getItem('user');
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem('token');
    if (!isTokenValid(stored)) {
      clearStoredSession();
      return null;
    }
    return stored;
  });
  const [user, setUser] = useState<UserProfile | null>(() => parseStoredUser());

  const role = useMemo<Role | null>(() => {
    if (user?.role) {
      return user.role;
    }
    if (!token) {
      return null;
    }
    try {
      return jwtDecode<UserToken>(token).role;
    } catch {
      return null;
    }
  }, [token, user]);

  const value: AuthCtx = {
    token,
    role,
    user,
    isAuthenticated: Boolean(token && role),
    login: (nextToken, nextUser) => {
      localStorage.setItem('token', nextToken);
      localStorage.setItem('user', JSON.stringify(nextUser));
      setToken(nextToken);
      setUser(nextUser);
    },
    logout: () => {
      clearStoredSession();
      setToken(null);
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
