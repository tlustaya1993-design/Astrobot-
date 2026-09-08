import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { reportClientEvent } from '@/lib/clientLog';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const token = search.get('token');
    const sessionId = search.get('sessionId');
    const email = search.get('email');
    const error = search.get('error');
    const returnToRaw = search.get('returnTo') || '/';
    const returnTo = returnToRaw.startsWith('/') ? returnToRaw : '/';

    reportClientEvent({
      kind: 'auth_callback_mounted',
      hasToken: Boolean(token),
      hasSessionId: Boolean(sessionId),
      hasEmail: Boolean(email),
      hasError: Boolean(error),
      returnTo,
    });

    try {
      if (error) {
        const message = safeDecode(error);
        reportClientEvent({ kind: 'auth_callback_error_param', message });
        setLocation(`/chat?authError=${encodeURIComponent(message)}`, { replace: true });
        return;
      }

      if (token && sessionId && email) {
        login(token, sessionId, email);
        // Логин мог разрешиться в уже существующий (не текущий анонимный) аккаунт —
        // если вход начался с онбординга, не возвращаем на форму онбординга напрямую
        // (там сброс шага/полей и возможен лишний редирект-мигание для уже готовых
        // аккаунтов). Отправляем на "/", а её загрузочная логика сама решит:
        // онбординг для нового профиля или чат для уже настроенного.
        const target = returnTo.startsWith('/onboarding') ? '/' : returnTo;
        reportClientEvent({ kind: 'auth_callback_login_ok', returnTo, target });
        setLocation(target, { replace: true });
        return;
      }

      reportClientEvent({ kind: 'auth_callback_missing_params' });
      setLocation('/chat?authError=' + encodeURIComponent('Не удалось завершить авторизацию'), { replace: true });
    } catch (err) {
      reportClientEvent({
        kind: 'auth_callback_exception',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  }, [login, setLocation]);

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
