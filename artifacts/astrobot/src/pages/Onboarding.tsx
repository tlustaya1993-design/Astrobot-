import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import {
  User,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { CityAutocomplete } from '@/components/ui/CityAutocomplete';
import { useGetMe, useUpsertMe, UpsertUserBody } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { FRESH_ONBOARDING_KEY } from '@/context/TutorialContext';

const slideVariants = {
  enter: { x: 40, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -40, opacity: 0 },
};

const ctaButtonClass =
  'rounded-xl min-h-12 font-semibold border-0 bg-gradient-to-r from-[#c9a227] via-[#e8d18c] to-[#f4e4a8] text-[#1a1508] shadow-[0_0_28px_rgba(212,175,55,0.42),0_4px_20px_rgba(0,0,0,0.35)] hover:brightness-105 hover:shadow-[0_0_32px_rgba(212,175,55,0.5)] transition-[filter,box-shadow] disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100';

function hasCitySelection(data: UpsertUserBody): boolean {
  return Boolean(
    data.birthPlace?.trim()
      && data.birthLat != null
      && data.birthLng != null
      && Number.isFinite(Number(data.birthLat))
      && Number.isFinite(Number(data.birthLng)),
  );
}

const backLinkClass =
  'w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1';

function OnboardingShell({
  step,
  icon,
  title,
  subtitle,
  children,
  footer,
  onLogin,
  contentClassName,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onLogin: () => void;
  contentClassName?: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col px-4">
      <header className="relative z-20 shrink-0 pb-1 pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-3">
          <button
            type="button"
            onClick={onLogin}
            className="inline-flex min-w-0 items-center gap-0.5 text-left text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">
              Уже есть аккаунт?{' '}
              <span className="text-primary font-medium">Войти</span>
            </span>
          </button>

          <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex justify-end gap-1.5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 rounded-full transition-all duration-500',
                    step === i
                      ? 'w-8 bg-primary shadow-[0_0_8px_rgba(212,175,55,0.6)]'
                      : step > i
                        ? 'w-5 bg-primary/40'
                        : 'w-5 bg-white/15',
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground/80 whitespace-nowrap">Шаг {step} из 3</p>
          </div>
        </div>
      </header>

      <main
        className={cn(
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-2',
          contentClassName,
        )}
      >
        <div className="mx-auto w-full max-w-sm pt-0.5 pb-4">
          <div className="relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-primary/25 bg-secondary/90 shadow-[0_0_28px_rgba(212,175,55,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] ring-2 ring-primary/20">
            <div
              className="pointer-events-none absolute inset-[-20%] rounded-full bg-primary/15 blur-2xl"
              aria-hidden
            />
            <div className="relative z-[1] text-primary">{icon}</div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-center mb-1">{title}</h1>
          <p className="text-muted-foreground text-center text-sm mb-4 leading-relaxed">{subtitle}</p>
          {children}
        </div>
      </main>

      <footer
        className="relative z-20 shrink-0 px-2 pt-1"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="mx-auto w-full max-w-sm">{footer}</div>
      </footer>
    </div>
  );
}

export default function Onboarding() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  const { openAuthModal } = useAuth();
  const { data: me, isLoading: isMeLoading } = useGetMe({
    request: { headers: getAuthHeaders() },
    query: { retry: 1 },
  });
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [birthTimeUnknown, setBirthTimeUnknown] = useState(false);
  const [isCitySelected, setIsCitySelected] = useState(false);
  const [cityDraft, setCityDraft] = useState('');
  const [formData, setFormData] = useState<UpsertUserBody>({
    name: '',
    birthDate: '',
    birthTime: '',
    birthPlace: '',
    birthLat: undefined,
    birthLng: undefined,
    tonePreferredDepth: 'deep',
    tonePreferredStyle: 'mystical',
  });

  const upsertMutation = useUpsertMe({
    request: { headers: getAuthHeaders() },
  });

  useEffect(() => {
    if (!isMeLoading && me?.onboardingDone) {
      setLocation('/chat?onboardingBlocked=1', { replace: true });
    }
  }, [isMeLoading, me?.onboardingDone, setLocation]);

  useEffect(() => {
    const onDismiss = () => {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('astrobot:keyboard-dismiss', onDismiss);
    return () => window.removeEventListener('astrobot:keyboard-dismiss', onDismiss);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const params = new URLSearchParams(window.location.search);
    root.classList.add('onboarding-route');

    const debug = params.get('onboarding-debug') === '1';
    const iosBgTest = params.get('ios-bg-test') === '1';
    const flatBgTest = params.get('flat-bg-test') === '1';

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const prevThemeColor = themeMeta?.getAttribute('content') ?? null;

    if (iosBgTest) {
      root.classList.add('ios-bg-test');
      themeMeta?.setAttribute('content', '#ff0000');
    }
    if (flatBgTest) {
      root.classList.add('flat-bg-test');
      console.info(
        '[flat-bg-test] Solid #7a1f5c on .onboarding-screen; gradients/overlays off. '
          + 'If top band remains → not onboarding background.',
      );
    }

    const logEnv = () => {
      const ua = navigator.userAgent;
      const safeProbe = document.createElement('div');
      safeProbe.style.cssText =
        'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
      document.body.appendChild(safeProbe);
      const safeCs = getComputedStyle(safeProbe);
      const safeArea = {
        top: safeCs.paddingTop,
        bottom: safeCs.paddingBottom,
      };
      safeProbe.remove();

      console.log('[onboarding env]', {
        displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
        iosStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
        likelyTelegram: /Telegram/i.test(ua),
        themeColorMeta: themeMeta?.getAttribute('content'),
        manifestTheme: '#0a0a14',
        appleStatusBar: 'black (index.html)',
        viewportFit: 'cover (index.html)',
        safeArea,
        innerHeight: window.innerHeight,
        visualViewport: window.visualViewport
          ? { height: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop }
          : null,
      });
    };

    const probe = (label: string, el: Element | null) => {
      if (!el) return { label, missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        label,
        top: Math.round(r.top),
        height: Math.round(r.height),
        bg: cs.backgroundColor,
        transform: cs.transform,
        paddingTop: cs.paddingTop,
      };
    };

    const logLayout = () => {
      console.table([
        probe('html', document.documentElement),
        probe('body', document.body),
        probe('#root', document.getElementById('root')),
        probe('.onboarding-screen', document.querySelector('[data-onboarding-screen]')),
      ]);
      console.log('CSS vars', {
        vvh: getComputedStyle(root).getPropertyValue('--vvh'),
        vvOffsetTop: getComputedStyle(root).getPropertyValue('--vv-offset-top'),
      });
    };

    if (debug) root.classList.add('onboarding-debug');
    if (debug || iosBgTest || flatBgTest) {
      logEnv();
      logLayout();
      window.addEventListener('resize', logLayout);
    }

    return () => {
      window.removeEventListener('resize', logLayout);
      root.classList.remove('onboarding-route', 'onboarding-debug', 'ios-bg-test', 'flat-bg-test');
      if (prevThemeColor) themeMeta?.setAttribute('content', prevThemeColor);
      else themeMeta?.setAttribute('content', '#0a0a14');
    };
  }, []);

  const handleNext = () => {
    setErrorMsg(null);
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setErrorMsg(null);
    setCityError(null);
    setStep((s) => s - 1);
  };

  const canProceedStep2 = Boolean(
    formData.birthDate?.trim() && (birthTimeUnknown || formData.birthTime?.trim()),
  );

  const canBuildChart = hasCitySelection(formData) && isCitySelected;

  const handleComplete = async () => {
    setErrorMsg(null);
    setCityError(null);

    if (!hasCitySelection(formData) || !isCitySelected) {
      setCityError('Выберите город из списка подсказок');
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        data: {
          ...formData,
          birthTime: birthTimeUnknown ? '12:00' : formData.birthTime,
          birthTimeUnknown,
          onboardingDone: true,
        },
      });
      try {
        sessionStorage.setItem(FRESH_ONBOARDING_KEY, '1');
      } catch {
        /* ignore */
      }
      setLocation('/chat');
    } catch (e) {
      console.error('Onboarding error', e);
      const message = e instanceof Error ? e.message : '';
      if (message.includes('Онбординг уже завершён')) {
        setErrorMsg('Этот аккаунт уже настроен. Переходим в чат.');
        setTimeout(() => setLocation('/chat?onboardingBlocked=1', { replace: true }), 600);
      } else {
        setErrorMsg('Не удалось сохранить данные. Проверьте подключение и попробуйте снова.');
      }
    }
  };

  const scrollFocusedFieldIntoView = (el: HTMLElement | null) => {
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  };

  const screen = (
    <div
      ref={scrollRef}
      data-onboarding-screen
      className="onboarding-screen flex flex-col overflow-hidden"
    >
      <div
        data-onboarding-bg-layer
        className="pointer-events-none absolute inset-0 opacity-[0.1] mix-blend-screen"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)',
          backgroundSize: '48px 48px',
        }}
        aria-hidden
      />

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              className="flex flex-col h-full min-h-0"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
              <OnboardingShell
                step={1}
                icon={<Sparkles className="h-6 w-6 drop-shadow-[0_0_10px_rgba(212,175,55,0.55)]" />}
                title="Добро пожаловать"
                subtitle="Ваш личный AI-астролог. Начнём с того, чтобы познакомиться."
                onLogin={() => openAuthModal('login')}
                footer={
                  <Button
                    className={cn('w-full max-w-sm mx-auto block', ctaButtonClass)}
                    onClick={handleNext}
                    disabled={!formData.name?.trim()}
                  >
                    Продолжить <ArrowRight className="w-4 h-4 ml-1 inline" />
                  </Button>
                }
              >
                <Input
                  icon={<User className="w-5 h-5" />}
                  placeholder="Ваше имя"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && formData.name?.trim() && handleNext()}
                  onFocus={(e) => scrollFocusedFieldIntoView(e.currentTarget)}
                />
              </OnboardingShell>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              className="flex flex-col h-full min-h-0"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
              <OnboardingShell
                step={2}
                contentClassName="pt-1"
                icon={<Sparkles className="h-6 w-6 drop-shadow-[0_0_10px_rgba(212,175,55,0.55)]" />}
                title="Когда вы родились?"
                subtitle="Точные данные нужны для расчёта натальной карты."
                onLogin={() => openAuthModal('login')}
                footer={
                  <div className="space-y-3 w-full max-w-sm mx-auto">
                    <button type="button" onClick={handleBack} className={backLinkClass}>
                      ← Назад
                    </button>
                    <Button
                      className={cn('w-full', ctaButtonClass)}
                      onClick={handleNext}
                      disabled={!canProceedStep2}
                    >
                      Далее <ArrowRight className="w-4 h-4 ml-1 inline" />
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4 rounded-2xl border border-border/50 bg-card/30 p-4 relative z-10">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground pl-1 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      Дата рождения
                    </label>
                    <DateInput
                      value={formData.birthDate || ''}
                      onChange={(date) => setFormData({ ...formData, birthDate: date })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground pl-1 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-primary" />
                      Время рождения
                    </label>
                    <input
                      type="time"
                      value={birthTimeUnknown ? '12:00' : (formData.birthTime || '')}
                      onChange={(e) => {
                        setBirthTimeUnknown(false);
                        setFormData({ ...formData, birthTime: e.target.value });
                      }}
                      disabled={birthTimeUnknown}
                      onFocus={(e) => scrollFocusedFieldIntoView(e.currentTarget)}
                      className="w-full bg-card/50 backdrop-blur-sm border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all duration-300 px-4 py-3.5 disabled:opacity-60"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/20 px-3 py-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={birthTimeUnknown}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setBirthTimeUnknown(checked);
                        setFormData({
                          ...formData,
                          birthTime: checked ? '12:00' : '',
                        });
                      }}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Я не знаю точное время рождения.
                      <br />
                      Используем 12:00 по умолчанию. Ответы будут менее конкретными.
                    </span>
                  </label>
                </div>
              </OnboardingShell>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              className="flex flex-col h-full min-h-0"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: 'easeInOut' }}
            >
              <OnboardingShell
                step={3}
                icon={<MapPin className="h-6 w-6 drop-shadow-[0_0_10px_rgba(212,175,55,0.55)]" />}
                title="Где вы родились?"
                subtitle="Введите название города и выберите его из списка."
                onLogin={() => openAuthModal('login')}
                footer={
                  <div className="space-y-3 w-full max-w-sm mx-auto">
                    {errorMsg && (
                      <p className="text-red-400 text-sm text-center bg-red-500/10 rounded-xl px-3 py-2">
                        {errorMsg}
                      </p>
                    )}
                    <button type="button" onClick={handleBack} className={backLinkClass}>
                      ← Назад
                    </button>
                    <Button
                      className={cn('w-full', ctaButtonClass)}
                      onClick={handleComplete}
                      disabled={!canBuildChart || upsertMutation.isPending}
                      isLoading={upsertMutation.isPending}
                    >
                      <span className="inline-flex items-center justify-center gap-1.5">
                        Построить карту
                        <Sparkles className="w-4 h-4" />
                      </span>
                    </Button>
                  </div>
                }
              >
                <div className="space-y-2 rounded-2xl border border-border/50 bg-card/30 p-4">
                  <label className="text-xs font-medium text-muted-foreground pl-1 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    Город рождения
                  </label>
                  <CityAutocomplete
                    value={formData.birthPlace || ''}
                    placeholder="Начните вводить город…"
                    onChange={(city, lat, lng) => {
                      setCityError(null);
                      setIsCitySelected(
                        typeof lat === 'number' &&
                          typeof lng === 'number' &&
                          Number.isFinite(lat) &&
                          Number.isFinite(lng),
                      );
                      setFormData({
                        ...formData,
                        birthPlace: city,
                        birthLat: lat,
                        birthLng: lng,
                      });
                    }}
                    onDraftChange={(draft) => {
                      setCityDraft(draft);
                      // После любого изменения текста запретим построение, пока
                      // пользователь снова не выберет значение из списка.
                      setIsCitySelected(false);
                    }}
                    onFocusInput={(el) => scrollFocusedFieldIntoView(el)}
                  />
                  {cityError && <p className="text-red-400 text-xs pl-1">{cityError}</p>}
                  {cityDraft.trim() && !canBuildChart && (
                    <p className="text-amber-400/90 text-xs pl-1">
                      Выберите город из выпадающего списка
                    </p>
                  )}
                </div>
              </OnboardingShell>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return createPortal(screen, document.body);
}
