import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

export type ChatOnboardingPhase = 'step1' | 'step2';

type Props = {
  phase: ChatOnboardingPhase;
  onNext: () => void;
  onSkip: () => void;
  reduceMotion: boolean | null;
};

function measureTarget(phase: ChatOnboardingPhase): DOMRect | null {
  const sel =
    phase === 'step1'
      ? '[data-onboarding-target="history-menu"]'
      : '[data-onboarding-target="add-contact"]';
  const el = document.querySelector(sel);
  return el?.getBoundingClientRect() ?? null;
}

export function ChatOnboardingOverlay({ phase, onNext, onSkip, reduceMotion }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const update = () => setRect(measureTarget(phase));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [phase]);

  const title = phase === 'step1' ? 'История диалогов' : 'Люди и синастрия';
  const body =
    phase === 'step1' ? (
      <>
        <p className="text-sm text-foreground/95 leading-relaxed">
          Нажмите <span className="font-semibold text-primary">«Чаты»</span> внизу экрана — откроется список ваших диалогов. С телефона можно ещё{' '}
          <span className="font-medium">провести от левого края экрана вправо</span>.
        </p>
      </>
    ) : (
      <p className="text-sm text-foreground/95 leading-relaxed">
        Нажмите <span className="font-semibold text-primary">«Добавить»</span> и внесите близкого по дате рождения — так появится разбор пары и{' '}
        <span className="font-medium">синастрия</span> с вашей картой.
      </p>
    );

  const cardMaxW = 320;
  const vw =
    typeof window !== 'undefined' ? Math.min(window.innerWidth - 24, cardMaxW) : cardMaxW;
  let top = 96;
  let left = 12;
  if (rect) {
    const gap = 12;
    const estH = 200;
    left = Math.max(12, Math.min(rect.left, window.innerWidth - vw - 12));
    if (rect.bottom + estH + gap < window.innerHeight) {
      top = rect.bottom + gap;
    } else {
      top = Math.max(72, rect.top - estH - gap);
    }
  }

  const node = (
    <AnimatePresence>
      <motion.div
        key={phase}
        initial={reduceMotion ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22 }}
        className="fixed inset-0 z-[350] pointer-events-auto"
        aria-modal="true"
        role="dialog"
        aria-labelledby="chat-onboarding-title"
      >
        <button
          type="button"
          className="absolute inset-0 z-0 bg-black/65 backdrop-blur-[2px]"
          aria-label="Закрыть подсказку"
          onClick={onSkip}
        />
        <motion.div
          initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
          transition={{ duration: reduceMotion ? 0 : 0.22 }}
          className="absolute z-10 rounded-2xl border border-primary/35 bg-card/98 shadow-2xl p-4 text-left"
          style={{ top, left, width: vw, maxWidth: cardMaxW }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="chat-onboarding-title" className="text-base font-display font-semibold text-foreground mb-2">
            {title}
          </h3>
          <div className="space-y-2 mb-4">{body}</div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={onSkip}
              className="px-3 py-2 rounded-xl text-sm border border-border text-muted-foreground hover:bg-white/5 transition"
            >
              Пропустить
            </button>
            {phase === 'step1' ? (
              <button
                type="button"
                onClick={onNext}
                className="px-3 py-2 rounded-xl text-sm bg-primary/15 border border-primary/40 text-primary font-medium hover:bg-primary/25 transition"
              >
                Далее
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="px-3 py-2 rounded-xl text-sm bg-primary/15 border border-primary/40 text-primary font-medium hover:bg-primary/25 transition"
              >
                Понятно
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
