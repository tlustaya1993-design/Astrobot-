import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogOut, LogIn, BrainCircuit, Sparkles, Trash2 } from 'lucide-react';
import { type AvatarConfig, saveAvatar } from '@/components/ui/AstroAvatar';
import IllustratedAvatar, { AvatarPortraitImage } from '@/components/ui/IllustratedAvatar';
import AvatarEditor from '@/components/ui/AvatarEditor';
import { getAuthHeaders } from '@/lib/session';
import { useAuth } from '@/context/AuthContext';
import AuthModal from '@/components/AuthModal';

interface UserProfile {
  name?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  birthTime?: string | null;
  gender?: string | null;
  requestsUsed?: number | null;
  requestsBalance?: number | null;
  freeRemaining?: number | null;
  freeLimit?: number | null;
  isUnlimited?: boolean;
  requestsTotalPurchased?: number | null;
}

interface Memory {
  id: number;
  content: string;
  updatedAt: string;
}

function getZodiacSimple(m: number, d: number): string {
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return 'Овен ♈';
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return 'Телец ♉';
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return 'Близнецы ♊';
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return 'Рак ♋';
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return 'Лев ♌';
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return 'Дева ♍';
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return 'Весы ♎';
  if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) return 'Скорпион ♏';
  if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return 'Стрелец ♐';
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return 'Козерог ♑';
  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return 'Водолей ♒';
  return 'Рыбы ♓';
}

function formatBirthDate(s: string): string {
  try {
    const d = new Date(s);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return s; }
}

type Section = 'view' | 'avatar' | 'memories';

interface Props {
  open: boolean;
  onClose: () => void;
  avatarConfig: AvatarConfig;
  onAvatarChange: (cfg: AvatarConfig) => void;
}

export default function ProfileSheet({ open, onClose, avatarConfig, onAvatarChange }: Props) {
  const { isLoggedIn, email, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [section, setSection] = useState<Section>('view');
  const [localAvatar, setLocalAvatar] = useState<AvatarConfig>(avatarConfig);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);

  useEffect(() => { setLocalAvatar(avatarConfig); }, [avatarConfig]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me', { headers: getAuthHeaders() });
      if (res.ok) setProfile(await res.json());
    } catch {}
  }, []);

  const fetchMemories = useCallback(async () => {
    setMemoriesLoading(true);
    try {
      const res = await fetch('/api/openai/memories', { headers: getAuthHeaders() });
      if (res.ok) setMemories(await res.json());
    } catch {} finally {
      setMemoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) { fetchProfile(); setSection('view'); }
  }, [open, fetchProfile]);

  useEffect(() => {
    if (section === 'memories') fetchMemories();
  }, [section, fetchMemories]);

  const handleDeleteMemory = async (id: number) => {
    try {
      await fetch(`/api/openai/memories/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      setMemories(m => m.filter(x => x.id !== id));
    } catch {}
  };

  const handleSaveAvatar = () => {
    saveAvatar(localAvatar);
    onAvatarChange(localAvatar);
    setSection('view');
  };

  const zodiac = profile?.birthDate ? getZodiacSimple(
    new Date(profile.birthDate).getMonth() + 1,
    new Date(profile.birthDate).getDate()
  ) : null;

  const backLabel = section === 'avatar' ? '← Назад' : section === 'memories' ? '← Назад' : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed bottom-0 inset-x-0 z-50 flex justify-center"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            <div className="relative w-full max-w-2xl bg-card border-t border-border rounded-t-3xl shadow-2xl overflow-visible">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                {backLabel ? (
                  <button
                    onClick={() => setSection('view')}
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    {backLabel}
                  </button>
                ) : (
                  <span className="text-base font-semibold font-display">Мой профиль</span>
                )}
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 transition">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {section === 'avatar' && (
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 md:-top-16 z-10">
                  <div className="relative rounded-full border-[4px] border-primary/75 shadow-[0_0_44px_rgba(212,175,55,0.36)] bg-[#08081a] w-[220px] h-[220px] md:w-[286px] md:h-[286px] overflow-hidden">
                    <AvatarPortraitImage
                      config={localAvatar}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
                  </div>
                </div>
              )}

              {/* ── View section ── */}
              {section === 'view' && (
                <div className="px-5 pb-8 space-y-5 max-h-[80vh] overflow-y-auto">
                  {/* Avatar + name row */}
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/40 shadow-[0_0_16px_rgba(212,175,55,0.2)]">
                        <IllustratedAvatar config={avatarConfig} size={80} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold font-display truncate">
                        {profile?.name || 'Пользователь'}
                      </p>
                      {zodiac && (
                        <p className="text-sm text-primary font-medium">{zodiac}</p>
                      )}
                      {profile?.requestsUsed != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {profile.requestsUsed} {pluralRequests(profile.requestsUsed)} отправлено
                        </p>
                      )}
                      {profile?.isUnlimited && (
                        <p className="text-xs text-emerald-400 mt-0.5">Безлимитный доступ активен</p>
                      )}
                      {!profile?.isUnlimited && profile?.freeRemaining != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Бесплатно: {profile.freeRemaining}/{profile.freeLimit ?? 5}
                        </p>
                      )}
                      {profile?.requestsBalance != null && (
                        <p className="text-xs text-primary/80 mt-0.5">
                          Осталось: {profile.requestsBalance} {pluralRequests(profile.requestsBalance)}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setSection('avatar')}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/35 text-primary text-sm font-medium hover:bg-primary/10 transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    Редактировать аватар
                  </button>

                  {/* Info cards */}
                  {profile?.birthDate && (
                    <InfoRow label="Дата рождения" value={formatBirthDate(profile.birthDate)} />
                  )}
                  {profile?.birthTime && (
                    <InfoRow label="Время рождения" value={profile.birthTime} />
                  )}
                  {profile?.birthPlace && (
                    <InfoRow label="Место рождения" value={profile.birthPlace} />
                  )}

                  {!profile?.birthDate && !profile?.name && (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Пройди онбординг, чтобы добавить данные
                    </p>
                  )}

                  {/* Memories button */}
                  <button
                    onClick={() => setSection('memories')}
                    className="w-full flex items-center gap-3 py-3 px-4 rounded-2xl border border-border/40 hover:border-primary/30 hover:bg-white/5 transition"
                  >
                    <BrainCircuit className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">Моя память</p>
                      <p className="text-xs text-muted-foreground">Что AstroBot помнит о тебе</p>
                    </div>
                    <span className="text-xs text-muted-foreground">→</span>
                  </button>

                  {/* Auth actions */}
                  <div className="pt-1 border-t border-border/40 space-y-2">
                    {isLoggedIn ? (
                      <>
                        {email && (
                          <p className="text-xs text-muted-foreground truncate">{email}</p>
                        )}
                        <button
                          onClick={() => { logout(); onClose(); }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/10 transition"
                        >
                          <LogOut className="w-4 h-4" />
                          Выйти из аккаунта
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setShowAuthModal(true)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-medium hover:bg-primary/10 transition"
                        >
                          <LogIn className="w-4 h-4" />
                          Войти / Зарегистрироваться
                        </button>
                        <p className="text-xs text-muted-foreground text-center leading-relaxed">
                          Синхронизирует историю и контекст на всех твоих устройствах
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} initialTab="login" />

              {/* ── Memories section ── */}
              {section === 'memories' && (
                <div className="px-5 pb-8 space-y-4 max-h-[75vh] overflow-y-auto">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    AstroBot запоминает важные факты из ваших разговоров, чтобы лучше понимать контекст.
                    Ты можешь удалить любой факт.
                  </p>

                  {memoriesLoading && (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  )}

                  {!memoriesLoading && memories.length === 0 && (
                    <div className="text-center py-10 space-y-2">
                      <BrainCircuit className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                      <p className="text-sm text-muted-foreground">Пока ничего не запомнено</p>
                      <p className="text-xs text-muted-foreground/60">
                        Память заполнится после нескольких разговоров
                      </p>
                    </div>
                  )}

                  {!memoriesLoading && memories.map(m => (
                    <div
                      key={m.id}
                      className="flex items-start gap-3 py-3 px-4 rounded-2xl border border-border/40 bg-white/[0.02] group"
                    >
                      <p className="flex-1 text-sm text-foreground leading-relaxed">{m.content}</p>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive transition-all"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Avatar editor ── */}
              {section === 'avatar' && (
                <div className="px-5 pb-8 pt-[14rem] md:pt-[13.25rem] space-y-5 max-h-[75vh] overflow-y-auto overflow-x-visible">
                  <AvatarEditor
                    avatarConfig={localAvatar}
                    onChange={setLocalAvatar}
                    onSave={handleSaveAvatar}
                    saveLabel="Сохранить аватар"
                  />
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function pluralRequests(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'запросов';
  if (mod10 === 1) return 'запрос';
  if (mod10 >= 2 && mod10 <= 4) return 'запроса';
  return 'запросов';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3 py-2.5 border-b border-border/40">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

