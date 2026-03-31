import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStoredEmail, getToken, saveAuth, clearAuth, getSessionId } from '@/lib/session';
import { apiVerifyToken } from '@/lib/auth';

interface AuthState {
  isLoggedIn: boolean;
  email: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, sessionId: string, email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: false,
    email: null,
    loading: true,
  });

  useEffect(() => {
    // Ensure anonymous session exists
    getSessionId();

    const token = getToken();
    const email = getStoredEmail();

    if (token && email) {
      // Quickly assume logged in from storage, verify in background
      setState({ isLoggedIn: true, email, loading: false });
      apiVerifyToken().then(payload => {
        if (!payload) {
          clearAuth();
          setState({ isLoggedIn: false, email: null, loading: false });
        }
      });
    } else {
      setState({ isLoggedIn: false, email: null, loading: false });
    }
  }, []);

  const login = useCallback((token: string, sessionId: string, email: string) => {
    saveAuth(token, sessionId, email);
    setState({ isLoggedIn: true, email, loading: false });
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setState({ isLoggedIn: false, email: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
