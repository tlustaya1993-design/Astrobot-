import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { saveAuth } from '@/lib/session';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const token = search.get('token');
    const sessionId = search.get('sessionId');
    const email = search.get('email');
    const error = search.get('error');
    const returnToRaw = search.get('returnTo') || '/';
    const returnTo = returnToRaw.startsWith('/') ? returnToRaw : '/';

    if (error) {
      const message = safeDecode(error);
      setLocation(`/chat?authError=${encodeURIComponent(message)}`, { replace: true });
      return;
    }

    if (token && sessionId && email) {
      saveAuth(token, sessionId, email);
      setLocation(returnTo, { replace: true });
      return;
    }

    setLocation('/chat?authError=' + encodeURIComponent('Не удалось завершить авторизацию'), { replace: true });
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_20%_10%,rgba(131,58,180,0.22),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(255,196,74,0.12),transparent_40%)]" />
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-primary tracking-widest font-display animate-pulse uppercase text-sm">Завершаем вход...</p>
      </div>
    </div>
  );
}
