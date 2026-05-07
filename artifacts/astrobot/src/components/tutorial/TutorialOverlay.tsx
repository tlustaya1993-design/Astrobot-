import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useTutorial, TUTORIAL_TOTAL_STEPS } from '@/context/TutorialContext';

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

interface StepCfg {
  targetId?: string;
  title: string;
  text: React.ReactNode;
  padding?: number;
  borderRadius?: number;
  delay?: number;
}

const STEPS: StepCfg[] = [
  // 1 – Welcome (centered card, no spotlight)
  {
    title: 'Привет! ✨',
    text: (
      <>
        <p>Сейчас я научу тебя пользоваться AstroBot.</p>
        <p className="mt-1 text-foreground/70">Это займёт всего 2 минуты — и потом у тебя не будет вопросов 💫</p>
      </>
    ),
  },
  // 2 – Daily forecast card
  {
    targetId: 'forecast-card',
    title: 'Прогноз на сегодня',
    text: <p>🔮 Нажми «Развернуть» — и ежедневно ты будешь видеть персональный прогноз на день.</p>,
    padding: 10,
    borderRadius: 18,
  },
  // 3 – Free requests
  {
    targetId: 'free-requests',
    title: '5 бесплатных запросов',
    text: (
      <>
        <p>✨ Ты можешь смело тестировать AstroBot бесплатно с 5 запросами.</p>
        <p className="mt-1 text-foreground/75">Этого достаточно, чтобы понять, как тебе ☺️</p>
        <p className="mt-0.5 text-foreground/50 text-[13px]">(надеюсь, хорошо 🤫)</p>
      </>
    ),
    padding: 8,
    borderRadius: 8,
  },
  // 4 – Chat input
  {
    targetId: 'chat-input',
    title: 'Диалоговая строка',
    text: (
      <>
        <p>💬 Здесь ты задаёшь любой вопрос AstroBot.</p>
        <p className="mt-1.5 text-[13px] text-foreground/60">
          🔒 Конфиденциально: никто, кроме тебя, не увидит твои запросы.
        </p>
      </>
    ),
    padding: 8,
    borderRadius: 32,
  },
  // 5 – Quick topics
  {
    targetId: 'quick-topics',
    title: 'Быстрые темы',
    text: (
      <p>
        😉 Нажми на любую тему — и готовый запрос автоматически появится в строке сообщения.
      </p>
    ),
    padding: 10,
    borderRadius: 20,
  },
  // 6 – Nav: Chats
  {
    targetId: 'nav-chats',
    title: 'Все чаты',
    text: (
      <>
        <p>🗂 Здесь хранятся все твои чаты.</p>
        <p className="mt-1 text-foreground/75">
          Ты можешь в любой момент вернуться к любому разговору и продолжить его.
        </p>
      </>
    ),
    padding: 10,
    borderRadius: 14,
  },
  // 7 – Nav: Profile
  {
    targetId: 'nav-profile',
    title: 'Профиль',
    text: (
      <>
        <p>👤 Здесь ты можешь:</p>
        <ul className="mt-1.5 space-y-0.5 text-[13px] text-foreground/80">
          {[
            'зарегистрироваться',
            'выйти из аккаунта',
            'изменить данные',
            'добавить новый аватар',
            'управлять подпиской',
            'купить пакет запросов',
          ].map(item => (
            <li key={item} className="flex gap-1.5 items-start">
              <span className="text-primary/50 mt-px">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </>
    ),
    padding: 10,
    borderRadius: 14,
  },
  // 8 – Profile: Registration (profile sheet must be open)
  {
    targetId: 'profile-auth',
    title: 'Регистрация',
    text: (
      <>
        <p>✨ Регистрация нужна, чтобы:</p>
        <ul className="mt-1.5 space-y-0.5 text-[13px] text-foreground/80">
          {[
            'сохранить свои чаты',
            'не потерять историю',
            'пользоваться AstroBot с любого устройства',
          ].map(item => (
            <li key={item} className="flex gap-1.5 items-start">
              <span className="text-primary/50 mt-px">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </>
    ),
    padding: 12,
    borderRadius: 16,
    delay: 520,
  },
  // 9 – Profile: Buy requests
  {
    targetId: 'profile-buy',
    title: 'Пакеты запросов',
    text: (
      <p>
        ⚡ Когда бесплатные запросы закончатся — здесь можно купить новый пакет и продолжить
        общение с AstroBot.
      </p>
    ),
    padding: 10,
    borderRadius: 14,
  },
  // 10 – People panel: Совместимость
  {
    targetId: 'people-panel',
    title: 'Совместимость',
    text: (
      <>
        <p>💕 Здесь ты добавляешь людей, с которыми хочешь посмотреть совместимость:</p>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] text-foreground/75">
          {['партнёр', 'муж', 'ребёнок', 'подруга', 'начальник', 'коллега'].map(r => (
            <span key={r} className="flex gap-1.5 items-center">
              <span className="text-primary/40">·</span>
              {r}
            </span>
          ))}
        </div>
        <p className="mt-1 text-[12px] text-foreground/45">и другие</p>
      </>
    ),
    padding: 6,
    borderRadius: 0,
    delay: 560,
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

export function TutorialOverlay() {
  const { step, isActive, next, skip } = useTutorial();
  const [spotRect, setSpotRect] = useState<SpotRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);

  const measure = useCallback((s: number) => {
    const cfg = STEPS[s - 1];
    if (!cfg?.targetId) {
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

  // Main effect: measure on step change
  useEffect(() => {
    if (!isActive) {
      setSpotRect(null);
      setTooltipPos(null);
      return;
    }
    retryRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);

    const cfg = STEPS[step - 1];
    const delay = cfg?.delay ?? 0;

    if (delay > 0) {
      timerRef.current = setTimeout(() => measure(step), delay);
    } else {
      measure(step);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [step, isActive, measure]);

  // Retry if element not found yet (e.g. panel still animating in)
  useEffect(() => {
    if (!isActive || step <= 1 || spotRect !== null) return;
    const cfg = STEPS[step - 1];
    if (!cfg?.targetId) return;
    if (retryRef.current >= 8) return;
    retryRef.current += 1;
    const t = setTimeout(() => measure(step), 200);
    return () => clearTimeout(t);
  }, [step, isActive, spotRect, measure]);

  // Re-measure on resize / visual viewport change
  useEffect(() => {
    if (!isActive || step <= 1) return;
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
  const isWelcome = step === 1;
  const isLast = step === TUTORIAL_TOTAL_STEPS;

  const content = (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="tutorial"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[500]"
          style={{ isolation: 'isolate' }}
        >
          {/* ── STEP 1: Welcome modal ── */}
          {isWelcome && (
            <div className="absolute inset-0 bg-black/82 backdrop-blur-sm flex items-center justify-center px-6 pt-safe">
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-sm rounded-3xl border border-primary/25 bg-card/98 p-6 flex flex-col gap-5 shadow-[0_28px_80px_rgba(0,0,0,0.65),0_0_0_1px_rgba(212,175,55,0.12)]"
                onClick={e => e.stopPropagation()}
              >
                {/* Icon */}
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full bg-primary/12 border border-primary/30 flex items-center justify-center shadow-[0_0_28px_rgba(212,175,55,0.22)]">
                    <span className="text-3xl">✨</span>
                  </div>
                </div>

                {/* Text */}
                <div className="text-center space-y-2">
                  <h2 className="text-xl font-display font-bold">{cfg?.title}</h2>
                  <div className="text-sm text-foreground/80 leading-relaxed space-y-1">
                    {cfg?.text}
                  </div>
                </div>

                {/* Progress dots */}
                <ProgressDots current={step} />

                {/* CTA */}
                <button
                  type="button"
                  onClick={next}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#c9a227] via-[#e8d18c] to-[#f4e4a8] text-[#1a1508] font-semibold text-sm shadow-[0_0_28px_rgba(212,175,55,0.32)] hover:brightness-105 active:brightness-95 transition touch-manipulation"
                >
                  Начать →
                </button>

                <button
                  type="button"
                  onClick={skip}
                  className="text-xs text-muted-foreground hover:text-foreground/60 transition text-center touch-manipulation"
                >
                  Пропустить обучение
                </button>
              </motion.div>
            </div>
          )}

          {/* ── STEPS 2–10: Spotlight mode ── */}
          {!isWelcome && (
            <>
              {/* Dark backdrop — tap anywhere to skip */}
              <button
                className="absolute inset-0 cursor-default"
                aria-label="Пропустить обучение"
                tabIndex={-1}
                onClick={skip}
              />

              {/* Spotlight cutout */}
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
                        '0 0 22px rgba(212,175,55,0.28)',
                        '0 0 48px rgba(212,175,55,0.12)',
                      ].join(', '),
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Tooltip */}
              <AnimatePresence mode="wait">
                {tooltipPos && cfg && (
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
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold font-display text-foreground leading-snug">
                        {cfg.title}
                      </p>
                      <button
                        type="button"
                        onClick={skip}
                        aria-label="Закрыть обучение"
                        className="shrink-0 p-1.5 -mr-1 -mt-0.5 rounded-full hover:bg-white/10 text-muted-foreground transition touch-manipulation"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Body */}
                    <div className="text-sm text-foreground/82 leading-relaxed">
                      {cfg.text}
                    </div>

                    {/* Footer */}
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
