import { getAuthHeaders, getStoredEmail, getToken } from './session';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface AuthResponse {
  token: string;
  sessionId: string;
  email: string;
}

export async function apiRegister(email: string, password: string, sessionId?: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ email, password, sessionId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
  return data as AuthResponse;
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка входа');
  return data as AuthResponse;
}

export async function apiVerifyToken(): Promise<{ sessionId: string; email: string } | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getToken() && !!getStoredEmail();
}

export async function getYandexOAuthStartUrl(returnTo = '/chat'): Promise<string> {
  const normalizedReturnTo =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/chat';
  const params = new URLSearchParams({ returnTo: normalizedReturnTo });
  const res = await fetch(`${API_BASE}/api/auth/yandex/start-url?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok || typeof data.url !== 'string') {
    throw new Error(data.error || 'Не удалось начать вход через Яндекс');
  }
  return data.url;
}

export async function apiLogout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch {
    // Best-effort call. Client-side token/session cleanup is the source of truth.
  }
}
