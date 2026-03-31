import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { User, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CityAutocomplete } from '@/components/ui/CityAutocomplete';
import { useUpsertMe, UpsertUserBody } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
          onboardingDone: true
        }
      });
      setLocation('/chat');
    } catch (e) {
      console.error("Onboarding error", e);
      setErrorMsg('Не удалось сохранить данные. Проверьте подключение и попробуйте снова.');
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 50 : -50,
      opacity: 0
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
      x: direction < 0 ? 50 : -50,
      opacity: 0
    })
  };

  return (
    <div className="h-[100dvh] flex flex-col px-6 pt-16 pb-10 relative overflow-hidden bg-background">
      <img
        src={`${import.meta.env.BASE_URL}images/cosmic-bg.png`}
        alt="Cosmic Background"
        className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen pointer-events-none"
      />

      <div className="absolute top-8 left-0 right-0 flex justify-center space-x-2 z-10">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${step === i ? 'w-8 bg-primary shadow-[0_0_8px_rgba(212,175,55,0.6)]' : 'w-4 bg-white/20'}`}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-sm mx-auto flex-1 flex flex-col justify-center overflow-hidden">
        <AnimatePresence mode="wait" custom={1}>

          {step === 1 && (
            <motion.div
              key="step1"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              custom={1}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex flex-col"
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
                />
                <Button
                  className="w-full"
                  onClick={handleNext}
                  disabled={!formData.name?.trim()}
                >
                  Продолжить <ArrowRight className="w-5 h-5 ml-2" />
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
              custom={1}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex flex-col"
            >
              <h1 className="text-3xl font-display font-bold text-center mb-2">Данные рождения</h1>
              <p className="text-muted-foreground text-center mb-6">Точные данные нужны для расчёта натальной карты.</p>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground pl-1">Дата рождения</label>
                  <input
                    type="date"
                    value={formData.birthDate || ''}
                    onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                    className="w-full bg-card/50 backdrop-blur-sm border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all duration-300 px-4 py-3.5"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground pl-1">Время рождения <span className="text-muted-foreground/50">(необязательно)</span></label>
                  <input
                    type="time"
                    value={formData.birthTime || ''}
                    onChange={e => setFormData({ ...formData, birthTime: e.target.value })}
                    className="w-full bg-card/50 backdrop-blur-sm border border-border rounded-xl text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all duration-300 px-4 py-3.5"
                  />
                </div>

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
              custom={1}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex flex-col"
            >
              <h1 className="text-3xl font-display font-bold text-center mb-2">Стиль общения</h1>
              <p className="text-muted-foreground text-center mb-6">Как вы хотите, чтобы AstroBot говорил с вами?</p>

              <div className="space-y-5">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground/80">Глубина</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setFormData({ ...formData, tonePreferredDepth: 'simple' })}
                      className={`p-3 rounded-xl border transition-all ${formData.tonePreferredDepth === 'simple' ? 'bg-primary/20 border-primary text-primary' : 'bg-card/50 border-border text-muted-foreground hover:border-white/20'}`}
                    >
                      Просто и ясно
                    </button>
                    <button
                      onClick={() => setFormData({ ...formData, tonePreferredDepth: 'deep' })}
                      className={`p-3 rounded-xl border transition-all ${formData.tonePreferredDepth === 'deep' ? 'bg-primary/20 border-primary text-primary' : 'bg-card/50 border-border text-muted-foreground hover:border-white/20'}`}
                    >
                      Глубоко и детально
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground/80">Тон</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setFormData({ ...formData, tonePreferredStyle: 'modern' })}
                      className={`p-3 rounded-xl border transition-all ${formData.tonePreferredStyle === 'modern' ? 'bg-primary/20 border-primary text-primary' : 'bg-card/50 border-border text-muted-foreground hover:border-white/20'}`}
                    >
                      Современный
                    </button>
                    <button
                      onClick={() => setFormData({ ...formData, tonePreferredStyle: 'mystical' })}
                      className={`p-3 rounded-xl border transition-all ${formData.tonePreferredStyle === 'mystical' ? 'bg-primary/20 border-primary text-primary' : 'bg-card/50 border-border text-muted-foreground hover:border-white/20'}`}
                    >
                      Мистический
                    </button>
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
  );
}
