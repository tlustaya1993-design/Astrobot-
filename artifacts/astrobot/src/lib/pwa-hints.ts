const KEYS = {
  firstSuccessAt:      'pwa_first_success_at',
  sessionCount:        'pwa_session_count',
  actionsCount:        'pwa_actions_count',
  tutorialShownCount:  'pwa_tutorial_shown_count',
  tutorialLastShownAt: 'pwa_tutorial_last_shown_at',
  tutorialDismissedAt: 'pwa_tutorial_dismissed_at',
  // sessionStorage key — prevents counting refreshes as new sessions
  sessionStarted:      'pwa_session_started',
} as const;

function getInt(key: string): number {
  try { return parseInt(localStorage.getItem(key) ?? '0', 10) || 0; } catch { return 0; }
}

function setStr(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Session tracking — call once per app mount; sessionStorage guards refreshes

export function recordSessionStart(): void {
  try {
    if (sessionStorage.getItem(KEYS.sessionStarted) === '1') return;
    sessionStorage.setItem(KEYS.sessionStarted, '1');
  } catch { return; }
  setStr(KEYS.sessionCount, String(getInt(KEYS.sessionCount) + 1));
}

// ---------------------------------------------------------------------------
// AI success — call after every successful AI response

export function recordAiSuccess(): void {
  if (!localStorage.getItem(KEYS.firstSuccessAt)) {
    setStr(KEYS.firstSuccessAt, new Date().toISOString());
  }
  setStr(KEYS.actionsCount, String(getInt(KEYS.actionsCount) + 1));
}

// ---------------------------------------------------------------------------
// Tutorial lifecycle

export function recordTutorialShown(): void {
  setStr(KEYS.tutorialShownCount, String(getInt(KEYS.tutorialShownCount) + 1));
  setStr(KEYS.tutorialLastShownAt, new Date().toISOString());
}

export function recordTutorialDismissed(): void {
  setStr(KEYS.tutorialDismissedAt, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Getters — used by the tutorial show/hide logic

export type PwaHints = {
  firstSuccessAt:      string | null;
  sessionCount:        number;
  actionsCount:        number;
  tutorialShownCount:  number;
  tutorialLastShownAt: string | null;
  tutorialDismissedAt: string | null;
};

export function getPwaHints(): PwaHints {
  try {
    return {
      firstSuccessAt:      localStorage.getItem(KEYS.firstSuccessAt),
      sessionCount:        getInt(KEYS.sessionCount),
      actionsCount:        getInt(KEYS.actionsCount),
      tutorialShownCount:  getInt(KEYS.tutorialShownCount),
      tutorialLastShownAt: localStorage.getItem(KEYS.tutorialLastShownAt),
      tutorialDismissedAt: localStorage.getItem(KEYS.tutorialDismissedAt),
    };
  } catch {
    return {
      firstSuccessAt: null, sessionCount: 0, actionsCount: 0,
      tutorialShownCount: 0, tutorialLastShownAt: null, tutorialDismissedAt: null,
    };
  }
}
