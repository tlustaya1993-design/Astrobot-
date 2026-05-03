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

// ---------------------------------------------------------------------------
// Anti-spam gate — call before showing the tutorial

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function msSince(isoOrNull: string | null): number {
  if (!isoOrNull) return Infinity;
  const t = Date.parse(isoOrNull);
  return isNaN(t) ? Infinity : Date.now() - t;
}

export type PwaTutorialBlockReason =
  | 'max_shown'           // shown >= 3 times
  | 'shown_recently'      // shown < 3 days ago
  | 'dismissed_recently'  // dismissed < 3 days ago
  | 'conditions_not_met'  // none of A/B/C conditions are true
  | null;                 // null = OK to show

/**
 * Full gate for showing the PWA install tutorial.
 * Standalone check (isStandalone) and is_test check must be done by the caller
 * since they require browser APIs outside this pure-localStorage module.
 *
 * Positive conditions (at least one must be true):
 *   A) first AI response received + never shown before
 *   B) returning user (≥3 sessions) + shown < 2 times
 *   C) active user (≥3 actions) + shown < 2 times
 */
export function shouldShowPwaTutorial(): { show: boolean; reason: PwaTutorialBlockReason } {
  const h = getPwaHints();

  // --- Positive conditions ---
  const conditionA = h.firstSuccessAt !== null && h.tutorialShownCount === 0;
  const conditionB = h.sessionCount >= 3 && h.tutorialShownCount < 2;
  const conditionC = h.actionsCount >= 3 && h.tutorialShownCount < 2;

  if (!conditionA && !conditionB && !conditionC) {
    return { show: false, reason: 'conditions_not_met' };
  }

  // --- Anti-spam gates ---
  if (h.tutorialShownCount >= 3) {
    return { show: false, reason: 'max_shown' };
  }
  if (msSince(h.tutorialLastShownAt) < THREE_DAYS_MS) {
    return { show: false, reason: 'shown_recently' };
  }
  if (msSince(h.tutorialDismissedAt) < THREE_DAYS_MS) {
    return { show: false, reason: 'dismissed_recently' };
  }

  return { show: true, reason: null };
}
