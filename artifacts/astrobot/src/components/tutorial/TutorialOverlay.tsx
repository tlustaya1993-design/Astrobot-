import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTutorial, TUTORIAL_TOTAL_STEPS } from '@/context/TutorialContext';

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

type StepLayout = 'spotlight' | 'centered';

interface StepCfg {
  layout: StepLayout;
  targetId?: string;
  title: string;
  text: React.ReactNode;
  padding?: number;
  borderRadius?: number;
  delay?: number;
  /** Подпись основной кнопки на centered-шагах */
  primaryCta?: string;
}

const STEPS: StepCfg[] = [
  {
    layout: 'centered',
    title: 'Здорово, что ты здесь!',
    text: (
      <p>
        Я хочу рассказать тебе, как тут все устроено, чтобы тебе было проще. Это займет 1 минуту.
      </p>
    ),
    primaryCta: 'Пойдем?',
  },
  {
    layout: 'spotlight',
    targetId: 'composer-area',
    title: 'Задай вопрос или выбери готовый вариант',
    text: (
      <p>
        Напиши свой вопрос или нажми на подсказку — текст появится в поле ввода, и можно сразу отправить.
      </p>
    ),
    padding: 10,
    borderRadius: 20,
    delay: 120,
  },
  {
    layout: 'spotlight',
    targetId: 'people-panel',
    title: 'Добавляй близких людей',
    text: (
      <p>
        Добавь ребёнка, партнёра, родственника или коллегу и задавай вопросы по их карте.
      </p>
    ),
    padding: 6,
    borderRadius: 0,
    delay: 200,
  },
  {
    layout: 'centered',
    title: 'Смотри отношения и выбирай глубину разбора',
    text: (
      <p>
        AstroBot умеет анализировать не только отдельного человека, но и взаимодействие между вами.
        Для важных вопросов можно включить глубокий режим разбора.
      </p>
    ),
  },
  {
    layout: 'centered',
    title: 'Продолжай разговор дальше',
    text: (
      <p>
        После ответа AstroBot может предложить идеи для продолжения разговора и помочь глубже
        исследовать тему.
      </p>
    ),
  },
  {
    layout: 'spotlight',
    targetId: 'nav-profile',
    title: 'Бесплатные запросы и пополнение',
    text: <p>Остаток запросов, покупки и настройки аккаунта находятся в профиле.</p>,
    padding: 10,
    borderRadius: 14,
  },
  {
    layout: 'spotlight',
    targetId: 'profile-auth',
    title: 'Войди в аккаунт и сохрани данные',
    text: (
      <p>
        Регистрация сохраняет карты, контакты, историю диалогов и покупки между устройствами.
      </p>
    ),
    padding: 12,
    borderRadius: 16,
    delay: 520,
  },
];

function calcTooltipPos(
  rect: SpotRect,
): { top: number; left: number; width: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tooltipW = Math.min(304, vw - 32);
  const approxH = 240;
  const gap = 14;

  const spaceBelow = vh - (rect.top + rect.height);
  const spaceAbove = rect.top;

  let top: number;
  if (spaceBelow >= approxH + gap || spaceBelow >= spaceAbove) {
    top = rect.top + rect.height + gap;
  } else {
    top = rect.top - approxH - gap;
  }
  top = Math.max(12, Math.min(top, vh - approxH - 12));

  let left = rect.left + rect.width / 2 - tooltipW / 2;
  left = Math.max(16, Math.min(left, vw - tooltipW - 16));

  return { top, left, width: tooltipW };
}

type CenteredCardProps = {
  cfg: StepCfg;
  step: number;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
};

function CenteredStepCard({ cfg, step, isLast, onNext, onSkip }: CenteredCardProps) {
  return (
    <div className="absolute inset-0 bg-black/82 backdrop-blur-sm flex items-center justify-center px-6 pt-safe">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-3xl border border-primary/25 bg-card/98 p-5 flex flex-col gap-4 shadow-[0_28px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(212,175,55,0.12)]"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-display font-bold leading-snug">{cfg.title}</h2>
        <div className="text-sm text-foreground/82 leading-relaxed">{cfg.text}</div>
        <div className="flex items-center justify-between gap-3">
          <ProgressDots current={step} compact />
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {step}/{TUTORIAL_TOTAL_STEPS}
            </span>
            <button
              type="button"
              onClick={onNext}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#c9a227] via-[#e8d18c] to-[#f4e4a8] text-[#1a1508] text-xs font-semibold shadow-sm hover:brightness-105 active:brightness-95 transition touch-manipulation min-h-[36px]"
            >
              {isLast ? 'Готово ✓' : cfg.primaryCta ?? 'Далее →'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground/60 transition text-center touch-manipulation -mt-1"
        >
          Пропустить обучение
        </button>
      </motion.div>
    </div>
  );
}

export function TutorialOverlay() {
  const { step, isActive, next, skip } = useTutorial();
  const [spotRect, setSpotRect] = useState<SpotRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);

  const measure = useCallback((s: number) => {
    const cfg = STEPS[s - 1];
    if (!cfg || cfg.layout !== 'spotlight' || !cfg.targetId) {
      setSpotRect(null);
      setTooltipPos(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tutorial-id="${cfg.targetId}"]`);
    if (!el) {
      setSpotRect(null);
      setTooltipPos(null);
      return;
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const pad = cfg.padding ?? 8;
    const br = cfg.borderRadius ?? 12;
    const spot: SpotRect = {
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
      borderRadius: br,
    };
    setSpotRect(spot);
    setTooltipPos(calcTooltipPos(spot));
  }, []);

  useEffect(() => {
    if (!isActive) {
      setSpotRect(null);
      setTooltipPos(null);
      return;
    }
    retryRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);

    const cfg = STEPS[step - 1];
    if (!cfg || cfg.layout !== 'spotlight') {
      setSpotRect(null);
      setTooltipPos(null);
      return;
    }

    const delay = cfg.delay ?? 0;
    if (delay > 0) {
      timerRef.current = setTimeout(() => measure(step), delay);
    } else {
      measure(step);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, isActive, measure]);

  useEffect(() => {
    if (!isActive) return;
    const cfg = STEPS[step - 1];
    if (!cfg || cfg.layout !== 'spotlight' || spotRect !== null) return;
    if (!cfg.targetId) return;
    if (retryRef.current >= 8) return;
    retryRef.current += 1;
    const t = setTimeout(() => measure(step), 200);
    return () => clearTimeout(t);
  }, [step, isActive, spotRect, measure]);

  useEffect(() => {
    if (!isActive) return;
    const cfg = STEPS[step - 1];
    if (!cfg || cfg.layout !== 'spotlight') return;
    const onResize = () => measure(step);
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (vv) vv.removeEventListener('resize', onResize);
    };
  }, [step, isActive, measure]);

  if (typeof document === 'undefined') return null;

  const cfg = isActive ? STEPS[step - 1] : null;
  const isCentered = cfg?.layout === 'centered';
  const isSpotlight = cfg?.layout === 'spotlight';
  const isLast = step === TUTORIAL_TOTAL_STEPS;

  const content = (
    <AnimatePresence>
      {isActive && cfg && (
        <motion.div
          key="tutorial"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[500]"
          style={{ isolation: 'isolate' }}
        >
          {isCentered && (
            <CenteredStepCard
              cfg={cfg}
              step={step}
              isLast={isLast}
              onNext={next}
              onSkip={skip}
            />
          )}

          {isSpotlight && (
            <>
              {spotRect ? (
                <>
                  <div className="absolute left-0 right-0 pointer-events-auto" style={{ top: 0, height: Math.max(0, spotRect.top) }} aria-hidden />
                  <div className="absolute left-0 right-0 pointer-events-auto" style={{ top: spotRect.top + spotRect.height, bottom: 0 }} aria-hidden />
                  <div className="absolute pointer-events-auto" style={{ top: spotRect.top, height: spotRect.height, left: 0, width: Math.max(0, spotRect.left) }} aria-hidden />
                  <div className="absolute pointer-events-auto" style={{ top: spotRect.top, height: spotRect.height, left: spotRect.left + spotRect.width, right: 0 }} aria-hidden />
                </>
              ) : (
                <div className="absolute inset-0 pointer-events-auto" aria-hidden />
              )}

              <AnimatePresence mode="wait">
                {spotRect && (
                  <motion.div
                    key={`spot-${step}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="absolute pointer-events-none"
                    style={{
                      top: spotRect.top,
                      left: spotRect.left,
                      width: spotRect.width,
                      height: spotRect.height,
                      borderRadius: spotRect.borderRadius,
                      boxShadow: [
                        '0 0 0 9999px rgba(0,0,0,0.80)',
                        '0 0 0 2px rgba(212,175,55,0.55)',
                        '0 0 0 22px rgba(212,175,55,0.28)',
                        '0 0 48px rgba(212,175,55,0.12)',
                      ].join(', '),
                    }}
                  />
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {tooltipPos && (
                  <motion.div
                    key={`tip-${step}`}
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute pointer-events-auto rounded-2xl border border-primary/20 bg-card/98 backdrop-blur-xl p-4 flex flex-col gap-3 shadow-[0_12px_44px_rgba(0,0,0,0.55),0_0_0_1px_rgba(212,175,55,0.1)]"
                    style={{ top: tooltipPos.top, left: tooltipPos.left, width: tooltipPos.width }}
                    onClick={e => e.stopPropagation()}
                  >
                    <p className="text-sm font-semibold font-display text-foreground leading-snug">
                      {cfg.title}
                    </p>
                    <div className="text-sm text-foreground/82 leading-relaxed">{cfg.text}</div>
                    <div className="flex items-center justify-between gap-3 pt-0.5">
                      <ProgressDots current={step} compact />
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {step}/{TUTORIAL_TOTAL_STEPS}
                        </span>
                        <button
                          type="button"
                          onClick={next}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#c9a227] via-[#e8d18c] to-[#f4e4a8] text-[#1a1508] text-xs font-semibold shadow-sm hover:brightness-105 active:brightness-95 transition touch-manipulation min-h-[36px]"
                        >
                          {isLast ? 'Готово ✓' : 'Далее →'}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={skip}
                      className="text-xs text-muted-foreground hover:text-foreground/60 transition text-center touch-manipulation -mt-1"
                    >
                      Пропустить обучение
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

function ProgressDots({ current, compact }: { current: number; compact?: boolean }) {
  return (
    <div className="flex gap-1 flex-1 items-center">
      {Array.from({ length: TUTORIAL_TOTAL_STEPS }, (_, i) => {
        const done = i < current - 1;
        const active = i === current - 1;
        return (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              active
                ? compact ? 'w-4 bg-primary' : 'w-6 bg-primary shadow-[0_0_6px_rgba(212,175,55,0.5)]'
                : done
                  ? 'w-1.5 bg-primary/50'
                  : 'w-1.5 bg-white/15'
            }`}
          />
        );
      })}
    </div>
  );
}
