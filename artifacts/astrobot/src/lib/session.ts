import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'astrobot_session_id';
const TOKEN_KEY = 'astrobot_jwt';
const EMAIL_KEY = 'astrobot_email';
const IS_TEST_KEY = 'is_test';

/**
 * Some Android WebViews / in-app browsers (Telegram, VK, old Chrome) throw
 * SecurityError on localStorage access. A throw during React render → white screen.
 * Keep an in-memory fallback so the app still boots.
 */
const memoryStore = new Map<string, string>();

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  }
}

function storageSet(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // memory-only session for this tab
  }
}

function storageRemove(key: string): void {
  memoryStore.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// Run synchronously at module load — before any React component mounts or
// makes API calls — so the x-is-test header is present from the very first request.
try {
  if (new URLSearchParams(window.location.search).get('test') === 'true') {
    storageSet(IS_TEST_KEY, 'true');
  }
} catch {
  // SSR or restricted env — skip silently
}

export function isTestMode(): boolean {
  return storageGet(IS_TEST_KEY) === 'true';
}

export function activateTestMode(): void {
  storageSet(IS_TEST_KEY, 'true');
  getSessionId();
}

export function getSessionId(): string {
  let sessionId = storageGet(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuidv4();
    storageSet(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getToken(): string | null {
  return storageGet(TOKEN_KEY);
}

export function getStoredEmail(): string | null {
  return storageGet(EMAIL_KEY);
}

export function saveAuth(token: string, sessionId: string, email: string) {
  storageSet(TOKEN_KEY, token);
  storageSet(SESSION_KEY, sessionId);
  storageSet(EMAIL_KEY, email);
}

export function clearAuth() {
  storageRemove(TOKEN_KEY);
  storageRemove(EMAIL_KEY);
  // Rotate session id on logout so backend no longer associates this browser
  // with the previous authenticated profile.
  storageSet(SESSION_KEY, uuidv4());
  clearDailyForecastCache();
}

/** Personalized daily forecast must not leak across accounts in the same tab. */
export function clearDailyForecastCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('daily-forecast-')) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    headers['x-session-id'] = getSessionId();
  }
  if (isTestMode()) {
    headers['x-is-test'] = 'true';
  }
  return headers;
}
