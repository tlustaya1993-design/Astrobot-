import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { User, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { CityAutocomplete } from '@/components/ui/CityAutocomplete';
import { useGetMe, useUpsertMe, UpsertUserBody } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { openAuthModal } = useAuth();
  const { data: me, isLoading: isMeLoading } = useGetMe({
    request: { headers: getAuthHeaders() },
    query: { retry: 1 },
  });
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [birthTimeUnknown, setBirthTimeUnknown] = useState(false);
  const [formData, setFormData] = useState<UpsertUserBody>({
    name: '',
    birthDate: '',
    birthTime: '',
    birthPlace: '',
    birthLat: undefined,
    birthLng: undefined,
    tonePreferredDepth: 'deep',
    tonePreferredStyle: 'mystical'
  });

  const upsertMutation = useUpsertMe({
    request: { headers: getAuthHeaders() }
  });

  useEffect(() => {
    // Prevent accidental profile overwrite via direct /onboarding link
    // when the current account has already completed setup.
    if (!isMeLoading && me?.onboardingDone) {
      setLocation('/chat?onboardingBlocked=1', { replace: true });
    }
  }, [isMeLoading, me?.onboardingDone, setLocation]);

  const handleNext = () => { setErrorMsg(null); setStep(s => s + 1); };
  const handleBack = () => { setErrorMsg(null); setStep(s => s - 1); };

  const handleComplete = async () => {
    setErrorMsg(null);
    try {
      await upsertMutation.mutateAsync({
        data: {
          ...formData,
          birthTime: birthTimeUnknown ? '12:00' : formData.birthTime,
          onboardingDone: true,
        }
      });
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

  const slideVariants = {
    enter: { x: 40, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -40, opacity: 0 },
  };

  const ctaButtonClass =
    'rounded-xl min-h-12 font-semibold border-0 bg-gradient-to-r from-[#c9a227] via-[#e8d18c] to-[#f4e4a8] text-[#1a1508] shadow-[0_0_28px_rgba(212,175,55,0.42),0_4px_20px_rgba(0,0,0,0.35)] hover:brightness-105 hover:shadow-[0_0_32px_rgba(212,175,55,0.5)] transition-[filter,box-shadow] disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100';

  return (
    <div className="h-[100dvh] relative overflow-hidden bg-[#06060c]">
      <div
        className="absolute inset-0 pointer-events-none bg-background"
        aria-hidden
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.85]"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% 20%, rgba(139, 92, 246, 0.35), transparent 55%), radial-gradient(circle at 20% 0%, rgba(167, 139, 250, 0.25), transparent 45%), radial-gradient(circle at 85% 95%, rgba(212, 175, 55, 0.22), transparent 50%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.12] mix-blend-screen"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Progress dots */}
      <div className="absolute top-10 inset-x-0 flex justify-center gap-2 z-10">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              step === i
                ? 'w-8 bg-primary shadow-[0_0_8px_rgba(212,175,55,0.6)]'
                : 'w-4 bg-white/20'
            }`}
          />
        ))}
      </div>

      <div className="absolute top-16 inset-x-0 z-20 flex justify-center px-6">
        <Button
          type="button"
          variant="ghost"
          className="h-9 rounded-full border border-primary/30 bg-black/20 px-4 text-xs sm:text-sm font-medium text-primary hover:bg-primary/10"
          onClick={() => openAuthModal('login')}
        >
          Войти / зарегистрироваться
        </Button>
      </div>

      {/* Centered content */}
      <div className="h-full flex flex-col items-center justify-center px-6 pt-16 pb-10">
        <div className="relative w-full max-w-sm">
          <AnimatePresence mode="wait">

            {step === 1 && (
              <motion.div
                key="step1"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: 'easeInOut' }}
              >
                <div className="relative mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-primary/25 bg-secondary/90 shadow-[0_0_40px_rgba(212,175,55,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] ring-2 ring-primary/20">
                  <div className="pointer-events-none absolute inset-[-20%] rounded-full bg-primary/15 blur-2xl" aria-hidden />
                  <Sparkles className="relative z-[1] h-10 w-10 text-primary drop-shadow-[0_0_12px_rgba(212,175,55,0.55)]" />
                </div>
                <h1 className="text-3xl font-display font-bold text-center mb-2">Добро пожаловать</h1>
                <p className="text-muted-foreground text-center mb-8">Ваш личный AI-астролог. Начнём с того, чтобы познакомиться.</p>

                <div className="space-y-4">
                  <Input
                    icon={<User className="w-5 h-5" />}
                    placeholder="Ваше имя"
                    value={formData.name || ''}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && formData.name?.trim() && handleNext()}
                  />
                  <Button
                    className={cn('w-full', ctaButtonClass)}
                    onClick={handleNext}
                    disabled={!formData.name?.trim()}
                  >
                    Продолжить <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: 'easeInOut' }}
              >
                <h1 className="text-3xl font-display font-bold text-center mb-2">Данные рождения</h1>
                <p className="text-muted-foreground text-center mb-6">Точные данные нужны для расчёта натальной карты.</p>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground pl-1">Дата рождения</label>
                    <DateInput
                      value={formData.birthDate || ''}
                      onChange={date => setFormData({ ...formData, birthDate: date })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground pl-1">
                      Время рождения <span className="text-muted-foreground/50">(необязательно)</span>
                    </label>
                    <input
                      type="time"
                      value={birthTimeUnknown ? '12:00' : (formData.birthTime || '')}
                      onChange={e => {
                        setBirthTimeUnknown(false);
                        setFormData({ ...formData, birthTime: e.target.value });
                      }}
                      disabled={birthTimeUnknown}
                      className="w-full bg-card/50 backdrop-blur-sm border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all duration-300 px-4 py-3.5"
                    />
                  </div>

                  <label className="flex items-start gap-2 rounded-xl border border-border bg-card/30 px-3 py-2.5">
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
                      className="mt-0.5"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Я не знаю точное время рождения.
                      <br />
                      Используем 12:00 по умолчанию. Ответы будут менее конкретными.
                    </span>
                  </label>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground pl-1">Город рождения</label>
                    <CityAutocomplete
                      value={formData.birthPlace || ''}
                      onChange={(city, lat, lng) => setFormData({
                        ...formData,
                        birthPlace: city,
                        birthLat: lat,
                        birthLng: lng
                      })}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" className="flex-1" onClick={handleBack}>Назад</Button>
                    <Button
                      className={cn('flex-1', ctaButtonClass)}
                      onClick={handleNext}
                      disabled={!formData.birthDate || !formData.birthPlace}
                    >
                      Далее
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: 'easeInOut' }}
              >
                <h1 className="text-3xl font-display font-bold text-center mb-2">Стиль общения</h1>
                <p className="text-muted-foreground text-center mb-6">Как вы хотите, чтобы AstroBot говорил с вами?</p>

                <div className="space-y-5">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground/80">Глубина</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'simple', label: 'Просто и ясно' },
                        { value: 'deep', label: 'Глубоко и детально' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFormData({ ...formData, tonePreferredDepth: opt.value as any })}
                          className={`py-3 px-2 rounded-xl border transition-all text-sm leading-tight ${
                            formData.tonePreferredDepth === opt.value
                              ? 'bg-primary/20 border-primary text-primary'
                              : 'bg-card/50 border-border text-muted-foreground hover:border-white/20'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium text-foreground/80">Тон</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'modern', label: 'Современный' },
                        { value: 'mystical', label: 'Мистический' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFormData({ ...formData, tonePreferredStyle: opt.value as any })}
                          className={`py-3 px-2 rounded-xl border transition-all text-sm ${
                            formData.tonePreferredStyle === opt.value
                              ? 'bg-primary/20 border-primary text-primary'
                              : 'bg-card/50 border-border text-muted-foreground hover:border-white/20'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {errorMsg && (
                    <p className="text-red-400 text-sm text-center bg-red-500/10 rounded-xl px-3 py-2">
                      {errorMsg}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={handleBack}>Назад</Button>
                    <Button
                      className={cn('flex-1', ctaButtonClass)}
                      onClick={handleComplete}
                      isLoading={upsertMutation.isPending}
                    >
                      Начать
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
