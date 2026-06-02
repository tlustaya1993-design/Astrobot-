import React, { useEffect, useRef, useState } from 'react';
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

function OnboardingShell({
  step,
  icon,
  title,
  subtitle,
  children,
  footer,
  onLogin,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onLogin: () => void;
}) {
  return (
    <>
      <div className="shrink-0 px-4 pt-safe pb-1">
        <button
          type="button"
          onClick={onLogin}
          className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors max-w-full"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Уже есть аккаунт?{' '}
            <span className="text-primary font-medium">Войти</span>
          </span>
        </button>
      </div>

      <div className="shrink-0 flex flex-col items-center gap-1 px-6 pt-2 pb-2">
        <div className="flex justify-center gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                step === i
                  ? 'w-10 bg-primary shadow-[0_0_8px_rgba(212,175,55,0.6)]'
                  : step > i
                    ? 'w-6 bg-primary/40'
                    : 'w-6 bg-white/15',
              )}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground/80">Шаг {step} из 3</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-6 pb-2">
        <div className="w-full max-w-sm mx-auto">
          <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/25 bg-secondary/90 shadow-[0_0_28px_rgba(212,175,55,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] ring-2 ring-primary/20">
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
      </div>

      <div
        className="shrink-0 px-6 pt-2"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        {footer}
      </div>
    </>
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

  return (
    <div
      ref={scrollRef}
      className="relative flex flex-col overflow-hidden bg-[#06060c] h-[100dvh]"
      style={{ height: 'var(--vvh, 100dvh)' }}
    >
      <div className="absolute inset-0 pointer-events-none bg-background" aria-hidden />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.85]"
        style={{
          background:
            'radial-gradient(ellipse 120% 80% at 50% 20%, rgba(139, 92, 246, 0.35), transparent 55%), radial-gradient(circle at 20% 0%, rgba(167, 139, 250, 0.25), transparent 45%), radial-gradient(circle at 85% 95%, rgba(212, 175, 55, 0.22), transparent 50%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-screen"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 flex flex-col h-full min-h-0">
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
                  icon={<Sparkles className="h-6 w-6 drop-shadow-[0_0_10px_rgba(212,175,55,0.55)]" />}
                title="Когда вы родились?"
                subtitle="Точные данные нужны для расчёта натальной карты."
                onLogin={() => openAuthModal('login')}
                footer={
                  <div className="space-y-3 w-full max-w-sm mx-auto">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
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
                <div className="space-y-4 rounded-2xl border border-border/50 bg-card/30 p-4">
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
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 min-h-12 rounded-xl"
                        onClick={handleBack}
                      >
                        Назад
                      </Button>
                      <Button
                        className={cn('flex-[1.4]', ctaButtonClass)}
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
}
