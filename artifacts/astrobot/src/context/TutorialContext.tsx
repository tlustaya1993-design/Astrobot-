import React, { createContext, useContext, useState, useCallback } from 'react';

const TUTORIAL_KEY = 'astrobot_tutorial_v1';
const LEGACY_ONBOARDING_KEY = 'astrobot_chat_onboarding_v1';

export const TUTORIAL_TOTAL_STEPS = 10;

interface TutorialContextValue {
  step: number;
  isActive: boolean;
  start: () => void;
  next: () => void;
  skip: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState(0);

  const isActive = step > 0;

  const start = useCallback(() => setStep(1), []);

  const next = useCallback(() => {
    setStep(s => {
      const n = s + 1;
      if (n > TUTORIAL_TOTAL_STEPS) {
        try {
          localStorage.setItem(TUTORIAL_KEY, '1');
          localStorage.setItem(LEGACY_ONBOARDING_KEY, '1');
        } catch { /* ignore */ }
        return 0;
      }
      return n;
    });
  }, []);

  const skip = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
      localStorage.setItem(LEGACY_ONBOARDING_KEY, '1');
    } catch { /* ignore */ }
    setStep(0);
  }, []);

  return (
    <TutorialContext.Provider value={{ step, isActive, start, next, skip }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial: no TutorialProvider');
  return ctx;
}

export function isTutorialDone(): boolean {
  try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch { return false; }
}
