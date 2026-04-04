import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStoredEmail, getToken, saveAuth, clearAuth, getSessionId } from '@/lib/session';
import { apiVerifyToken } from '@/lib/auth';
import AuthModal from '@/components/AuthModal';

interface AuthState {
  isLoggedIn: boolean;
  email: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, sessionId: string, email: string) => void;
  logout: () => void;
  openAuthModal: (tab?: 'login' | 'register') => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: false,
    email: null,
    loading: true,
  });
  const [authModalState, setAuthModalState] = useState<{ open: boolean; tab: 'login' | 'register' }>({
    open: false,
    tab: 'login',
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

  const openAuthModal = useCallback((tab: 'login' | 'register' = 'login') => {
    setAuthModalState({ open: true, tab });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, openAuthModal }}>
      {children}
      <AuthModalHost
        open={authModalState.open}
        tab={authModalState.tab}
        onClose={() => setAuthModalState((prev) => ({ ...prev, open: false }))}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

function AuthModalHost({
  open,
  tab,
  onClose,
}: {
  open: boolean;
  tab: 'login' | 'register';
  onClose: () => void;
}) {
  return <AuthModal open={open} onClose={onClose} initialTab={tab} />;
}
