import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { User, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DateInput } from '@/components/ui/DateInput';
import { CityAutocomplete } from '@/components/ui/CityAutocomplete';
import { useUpsertMe, UpsertUserBody } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';

export default function Onboarding() {
  const [, setLocation] = useLocation();
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
      setErrorMsg('Не удалось сохранить данные. Проверьте подключение и попробуйте снова.');
    }
  };

  const slideVariants = {
    enter: { x: 40, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -40, opacity: 0 },
  };

  return (
    <div className="h-[100dvh] relative overflow-hidden bg-background">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            "radial-gradient(circle at 20% 0%, rgba(139, 92, 246, 0.22), transparent 45%), radial-gradient(circle at 80% 100%, rgba(212, 175, 55, 0.18), transparent 45%)",
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
                <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-secondary flex items-center justify-center border border-white/10 shadow-xl shadow-primary/20">
                  <Sparkles className="w-10 h-10 text-primary" />
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
                    className="w-full"
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
                      className="flex-1"
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
                      className="flex-1"
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
