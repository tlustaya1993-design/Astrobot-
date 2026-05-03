import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { isTestMode } from '@/lib/session';
import { isStandalone, detectPwaDevice, type PwaDevice } from '@/lib/pwa-detect';
import {
  shouldShowPwaTutorial,
  recordTutorialShown,
  recordTutorialDismissed,
} from '@/lib/pwa-hints';

// ---------------------------------------------------------------------------
// Types

type Phase = 'hidden' | 'banner' | 'instructions';

export type PwaInstallBannerHandle = {
  check: () => void;
};

// ---------------------------------------------------------------------------
// Device instruction content

type InstructionStep = { icon: React.ReactNode; text: string };

type DeviceInstructions = {
  title: string;
  steps?: InstructionStep[];
  note?: string;
  copyLink?: boolean;
};

const ShareIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
    <polyline points="16 6 12 2 8 6"/>
    <line x1="12" y1="2" x2="12" y2="15"/>
  </svg>
);
const PlusSquareIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const AddToHomeIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const MenuIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" fill="currentColor"/>
    <circle cx="12" cy="12" r="1" fill="currentColor"/>
    <circle cx="12" cy="19" r="1" fill="currentColor"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

function getInstructions(device: PwaDevice): DeviceInstructions {
  switch (device) {
    case 'ios-safari':
      return {
        title: 'Как добавить на главный экран',
        steps: [
          { icon: <ShareIcon />, text: 'Нажмите «Поделиться» внизу браузера' },
          { icon: <AddToHomeIcon />, text: 'Выберите «На экран Домой»' },
          { icon: <CheckIcon />, text: 'Нажмите «Добавить»' },
        ],
      };
    case 'ios-other':
      return {
        title: 'Добавление через Safari',
        note: 'На iPhone добавление на экран стабильнее всего работает через Safari.\n\nСкопируйте ссылку, откройте сайт в Safari:\nПоделиться → На экран Домой → Добавить.',
        copyLink: true,
      };
    case 'android-chrome':
      return {
        title: 'Как добавить на главный экран',
        steps: [
          { icon: <MenuIcon />, text: 'Нажмите меню ⋮ в браузере' },
          { icon: <AddToHomeIcon />, text: 'Выберите «Добавить на главный экран» или «Установить приложение»' },
          { icon: <CheckIcon />, text: 'Подтвердите' },
        ],
      };
    case 'android-yandex':
    case 'android-other':
      return {
        title: 'Как добавить на главный экран',
        steps: [
          { icon: <MenuIcon />, text: 'Откройте меню браузера' },
          { icon: <PlusSquareIcon />, text: 'Найдите «Добавить на экран», «Добавить ярлык» или «Установить приложение»' },
          { icon: <CheckIcon />, text: 'Подтвердите' },
        ],
      };
    default:
      return {
        title: 'Добавление на главный экран',
        note: 'Откройте меню браузера и выберите добавление сайта на главный экран.\n\nЕсли такого пункта нет — откройте сайт в Safari на iPhone или Chrome на Android.',
      };
  }
}

// ---------------------------------------------------------------------------
// Sub-components

function Step({ n, icon, text }: { n: number; icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-none w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-1.5">
        <span className="text-xs text-muted-foreground mr-1.5">{n}.</span>
        <span className="text-sm">{text}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component

type Props = {
  handle?: React.Ref<PwaInstallBannerHandle>;
};

export default function PwaInstallBanner({ handle }: Props) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [iosTab, setIosTab] = useState<'ios' | 'android'>('ios');
  const device = useRef<PwaDevice>('desktop');

  const tryShow = useCallback(() => {
    if (isStandalone() || isTestMode()) return;
    const { show } = shouldShowPwaTutorial();
    if (!show) return;
    device.current = detectPwaDevice();
    recordTutorialShown();
    setPhase('banner');
  }, []);

  // Check on mount (covers session_count condition)
  useEffect(() => { tryShow(); }, [tryShow]);

  // Expose imperative handle so Chat.tsx can call check() after AI success
  useImperativeHandle(handle, () => ({ check: tryShow }), [tryShow]);

  const dismiss = useCallback(() => {
    recordTutorialDismissed();
    setPhase('hidden');
  }, []);

  const openInstructions = useCallback(() => {
    const d = detectPwaDevice();
    device.current = d;
    // Pre-select the matching tab
    setIosTab(d === 'ios-safari' || d === 'ios-other' ? 'ios' : 'android');
    setPhase('instructions');
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      // small visual feedback via the button text would need state, skip for simplicity
    } catch { /* ignore */ }
  }, []);

  if (phase === 'hidden') return null;

  const BOTTOM_NAV_HEIGHT = 'calc(3.5rem + env(safe-area-inset-bottom, 0px))';

  // ---- BANNER ----
  if (phase === 'banner') {
    return (
      <div
        className="fixed left-3 right-3 z-[45] rounded-2xl border border-amber-500/40 bg-card/95 backdrop-blur-md shadow-xl px-3 py-3 flex items-center gap-3"
        style={{ bottom: `calc(${BOTTOM_NAV_HEIGHT} + 0.5rem)` }}
      >
        {/* Icon */}
        <div className="flex-none w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 text-xl">
          ✦
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Добавь AstroBot на экран</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">Будет как приложение и быстрее открываться</p>
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={openInstructions}
          className="flex-none px-3.5 py-2 rounded-xl bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors"
        >
          Добавить
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="flex-none text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
        >
          Позже
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Закрыть"
          className="flex-none text-muted-foreground hover:text-foreground transition-colors -mr-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    );
  }

  // ---- INSTRUCTIONS SHEET ----
  const iosDevice: PwaDevice = 'ios-safari';
  const androidDevice: PwaDevice = 'android-chrome';
  const activeDevice = iosTab === 'ios' ? iosDevice : androidDevice;
  const instructions = getInstructions(activeDevice);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[44] bg-black/40 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 z-[45] rounded-t-2xl border-t border-border bg-card shadow-2xl px-4 pt-4 pb-6"
        style={{ bottom: 0 }}
      >
        {/* Handle + close */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-8 h-1 rounded-full bg-border mx-auto absolute left-1/2 -translate-x-1/2 top-2.5" />
          <p className="text-base font-semibold">{instructions.title}</p>
          <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-5 p-1 rounded-xl bg-background border border-border">
          <button
            type="button"
            onClick={() => setIosTab('ios')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${iosTab === 'ios' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <span>🍎</span> iPhone (Safari)
          </button>
          <button
            type="button"
            onClick={() => setIosTab('android')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${iosTab === 'android' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <span>🤖</span> Android (Chrome)
          </button>
        </div>

        {/* Steps or note */}
        {instructions.steps ? (
          <div className="space-y-3.5">
            {instructions.steps.map((s, i) => (
              <Step key={i} n={i + 1} icon={s.icon} text={s.text} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
            {instructions.note}
          </p>
        )}

        {instructions.copyLink && (
          <button
            type="button"
            onClick={copyLink}
            className="mt-5 w-full py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            Скопировать ссылку
          </button>
        )}

        {/* Safe area spacer */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </>
  );
}
