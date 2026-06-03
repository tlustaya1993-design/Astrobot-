import React, { useCallback, useEffect, useImperativeHandle, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Sparkles, X } from 'lucide-react';
import { isTestMode } from '@/lib/session';
import { isStandalone, detectPwaDevice, type PwaDevice } from '@/lib/pwa-detect';
import {
  PWA_FIRST_AI_SUCCESS_EVENT,
  shouldShowPwaPrompt,
  recordTutorialShown,
  recordTutorialDismissed,
} from '@/lib/pwa-hints';
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type PwaInstallBannerHandle = {
  /** @deprecated Prompt opens via first-AI-success event; kept for compatibility. */
  check: () => void;
};

// ---------------------------------------------------------------------------
// Instruction icons (inline SVG — same set as before)

const ShareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
);
const PlusCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);
const AddToHomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </svg>
);

type FlowStep = { icon: React.ReactNode; caption: string; pill?: string };

const IOS_FLOW: FlowStep[] = [
  { icon: <ShareIcon />, caption: 'Нажмите «Поделиться»' },
  { icon: <PlusCircleIcon />, caption: 'Выберите «На экран «Домой»' },
  { icon: <Sparkles className="w-5 h-5 text-primary" aria-hidden />, caption: 'При желании переименуйте' },
  { icon: null, caption: 'Нажмите «Добавить»', pill: 'Добавить' },
];

const ANDROID_FLOW: FlowStep[] = [
  { icon: <MenuIcon />, caption: 'Откройте меню' },
  { icon: <PlusCircleIcon />, caption: 'Выберите «Добавить на главный экран»' },
  { icon: null, caption: 'Нажмите «Добавить»', pill: 'Добавить' },
];

function FlowArrow() {
  return (
    <span className="text-muted-foreground/40 text-xs shrink-0 px-0.5" aria-hidden>
      →
    </span>
  );
}

function FlowRow({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flex items-start gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <FlowArrow /> : null}
          <div className="flex flex-col items-center gap-1.5 min-w-[4.5rem] max-w-[5.5rem] shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-background/80 text-primary">
              {step.pill ? (
                <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {step.pill}
                </span>
              ) : (
                step.icon
              )}
            </div>
            <p className="text-[10px] leading-tight text-center text-muted-foreground">{step.caption}</p>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function PlatformBlock({
  emoji,
  label,
  steps,
  defaultOpen,
}: {
  emoji: string;
  label: string;
  steps: FlowStep[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-3 text-left touch-manipulation"
      >
        <span className="text-base" aria-hidden>{emoji}</span>
        <span className="flex-1 text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <div className="px-3.5 pb-3.5 pt-0 border-t border-border/40">
          <FlowRow steps={steps} />
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  handle?: React.Ref<PwaInstallBannerHandle>;
  /** When true, do not open (welcome screen, chat onboarding, tutorial, etc.). */
  blocked?: boolean;
};

export default function PwaInstallBanner({ handle, blocked = false }: Props) {
  const [open, setOpen] = useState(false);
  const device = detectPwaDevice();
  const defaultIos = device === 'ios-safari' || device === 'ios-other';

  const tryShow = useCallback(() => {
    if (blocked || isStandalone() || isTestMode()) return;
    if (!shouldShowPwaPrompt()) return;
    recordTutorialShown();
    setOpen(true);
  }, [blocked]);

  useImperativeHandle(handle, () => ({ check: tryShow }), [tryShow]);

  useEffect(() => {
    const onFirstSuccess = () => {
      window.setTimeout(() => tryShow(), 400);
    };
    window.addEventListener(PWA_FIRST_AI_SUCCESS_EVENT, onFirstSuccess);
    return () => window.removeEventListener(PWA_FIRST_AI_SUCCESS_EVENT, onFirstSuccess);
  }, [tryShow]);

  const dismiss = useCallback(() => {
    recordTutorialDismissed();
    setOpen(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) dismiss();
    },
    [dismiss],
  );

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[380] bg-black/65 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-[381] w-[calc(100%-2rem)] max-w-md max-h-[min(90dvh,var(--vvh,100dvh))]',
            'translate-x-[-50%] translate-y-[-50%] overflow-y-auto overscroll-contain',
            'rounded-2xl border border-primary/20 bg-card p-0 shadow-2xl',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
          onOpenAutoFocus={e => e.preventDefault()}
        >
          <button
            type="button"
            onClick={dismiss}
            aria-label="Закрыть"
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative px-4 pt-5 pb-4">
            <div className="flex gap-3 items-start pr-8">
              <div className="flex-1 min-w-0">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-sm">
                  ✦
                </div>
                <h2 className="font-display text-lg font-bold leading-snug text-foreground">
                  Пользоваться удобнее
                  <br />
                  <span className="text-primary">как приложением</span>
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  Добавьте AstroBot на главный экран телефона — он будет открываться отдельно,
                  быстрее и без лишних элементов браузера.
                </p>
              </div>
              <img
                src={`${import.meta.env.BASE_URL}images/pwa-prompt-bot.png`}
                alt=""
                role="presentation"
                width={88}
                height={88}
                className="shrink-0 w-[5.5rem] h-[5.5rem] object-contain object-center -mt-1"
                draggable={false}
              />
            </div>

            <div className="mt-4 space-y-2.5">
              <PlatformBlock emoji="🍎" label="iPhone (Safari)" steps={IOS_FLOW} defaultOpen={defaultIos} />
              <PlatformBlock emoji="🤖" label="Android (Chrome)" steps={ANDROID_FLOW} defaultOpen={!defaultIos} />
            </div>

            <p className="mt-3 flex items-center gap-2 rounded-xl border border-border/50 bg-background/30 px-3 py-2.5 text-[11px] text-muted-foreground leading-snug">
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary/70" aria-hidden />
              После добавления иконка AstroBot появится на вашем экране.
            </p>

            <button
              type="button"
              onClick={dismiss}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#c9a227] via-[#e8d18c] to-[#f4e4a8] py-3 text-sm font-semibold text-[#1a1508] shadow-sm hover:brightness-105 active:brightness-95 transition touch-manipulation"
            >
              Понятно
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
