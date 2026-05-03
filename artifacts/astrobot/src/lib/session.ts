import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'astrobot_session_id';
const TOKEN_KEY = 'astrobot_jwt';
const EMAIL_KEY = 'astrobot_email';
const IS_TEST_KEY = 'is_test';

export function isTestMode(): boolean {
  try {
    return localStorage.getItem(IS_TEST_KEY) === 'true';
  } catch {
    return false;
  }
}

export function activateTestMode(): void {
  try {
    localStorage.setItem(IS_TEST_KEY, 'true');
    // Ensure a session ID exists so the backend can tag it as test
    getSessionId();
  } catch {
    // ignore
  }
}

export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

export function saveAuth(token: string, sessionId: string, email: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SESSION_KEY, sessionId);
  localStorage.setItem(EMAIL_KEY, email);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  // Rotate session id on logout so backend no longer associates this browser
  // with the previous authenticated profile.
  localStorage.setItem(SESSION_KEY, uuidv4());
}

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  const base = token
    ? { 'Authorization': `Bearer ${token}` }
    : { 'x-session-id': getSessionId() };
  if (isTestMode()) {
    return { ...base, 'x-is-test': 'true' };
  }
  return base;
}
