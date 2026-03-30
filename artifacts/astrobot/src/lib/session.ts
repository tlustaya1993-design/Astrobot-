import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'astrobot_session_id';

export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getAuthHeaders() {
  return {
    'x-session-id': getSessionId(),
  };
}
