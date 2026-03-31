import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, LogOut, LogIn } from 'lucide-react';
import AstroAvatar, {
  HAIR_COLORS, ROBE_COLORS, EYE_COLORS, HAIR_STYLES,
  type AvatarConfig, loadAvatar, saveAvatar,
} from '@/components/ui/AstroAvatar';
import { getAuthHeaders } from '@/lib/session';
import { useAuth } from '@/context/AuthContext';
import AuthModal from '@/components/AuthModal';

interface UserProfile {
  name?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  birthTime?: string | null;
  gender?: string | null;
}

function getZodiac(birthDate: string): string {
  const d = new Date(birthDate);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const signs: [number, number, string][] = [
    [3,21,'Овен'],[4,20,'Телец'],[5,21,'Близнецы'],[6,21,'Рак'],
    [7,23,'Лев'],[8,23,'Дева'],[9,23,'Весы'],[10,23,'Скорпион'],
    [11,22,'Стрелец'],[12,22,'Козерог'],[1,20,'Козерог'],
    [1,21,'Водолей'],[2,19,'Водолей'],[2,20,'Рыбы'],[3,20,'Рыбы'],
  ];
  const zodiacs: [number, number, string][] = [
    [1,20,'Козерог'],[2,19,'Водолей'],[3,20,'Рыбы'],[3,21,'Овен'],
    [4,20,'Телец'],[5,21,'Близнецы'],[6,21,'Рак'],[7,23,'Лев'],
    [8,23,'Дева'],[9,23,'Весы'],[10,23,'Скорпион'],[11,22,'Стрелец'],
    [12,21,'Козерог'],
  ];
  const table: [string, number, number][] = [
    ['Козерог',12,22],['Водолей',1,20],['Рыбы',2,19],
    ['Овен',3,21],['Телец',4,20],['Близнецы',5,21],
    ['Рак',6,21],['Лев',7,23],['Дева',8,23],
    ['Весы',9,23],['Скорпион',10,23],['Стрелец',11,22],
  ];
  for (const [sign, sm, sd] of table) {
    if ((m === sm && day >= sd) || (m === (sm % 12) + 1 && day < sd)) {
      if (m === 12 && day >= 22) return 'Козерог';
      if (m === sm && day >= sd) return sign;
    }
  }
  return getZodiacSimple(m, day);
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

type Section = 'view' | 'avatar';

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

  useEffect(() => { setLocalAvatar(avatarConfig); }, [avatarConfig]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me', { headers: getAuthHeaders() });
      if (res.ok) setProfile(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (open) { fetchProfile(); setSection('view'); }
  }, [open, fetchProfile]);

  const handleSaveAvatar = () => {
    saveAvatar(localAvatar);
    onAvatarChange(localAvatar);
    setSection('view');
  };

  const zodiac = profile?.birthDate ? getZodiacSimple(
    new Date(profile.birthDate).getMonth() + 1,
    new Date(profile.birthDate).getDate()
  ) : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 inset-x-0 z-50 flex justify-center"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            <div className="w-full max-w-2xl bg-card border-t border-border rounded-t-3xl overflow-hidden shadow-2xl">
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3">
                {section === 'avatar' ? (
                  <button
                    onClick={() => setSection('view')}
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    ← Назад
                  </button>
                ) : (
                  <span className="text-base font-semibold font-display">Мой профиль</span>
                )}
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 transition">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* ── View section ── */}
              {section === 'view' && (
                <div className="px-5 pb-8 space-y-5">
                  {/* Avatar + name row */}
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/40 shadow-[0_0_16px_rgba(212,175,55,0.2)]">
                        <AstroAvatar config={avatarConfig} size={80} />
                      </div>
                      <button
                        onClick={() => setSection('avatar')}
                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/80 transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold font-display truncate">
                        {profile?.name || 'Пользователь'}
                      </p>
                      {zodiac && (
                        <p className="text-sm text-primary font-medium">{zodiac}</p>
                      )}
                    </div>
                  </div>

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
                    )}
                  </div>
                </div>
              )}

              <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} initialTab="login" />

              {/* ── Avatar editor ── */}
              {section === 'avatar' && (
                <div className="px-5 pb-8 space-y-5">
                  {/* Preview */}
                  <div className="flex justify-center">
                    <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-primary/40 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                      <AstroAvatar config={localAvatar} size={112} />
                    </div>
                  </div>

                  {/* Hairstyle */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Причёска</p>
                    <div className="grid grid-cols-3 gap-2">
                      {HAIR_STYLES.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setLocalAvatar(a => ({ ...a, hairStyle: s.id }))}
                          className={`py-2 px-1 rounded-xl text-xs font-medium border transition-all ${
                            localAvatar.hairStyle === s.id
                              ? 'border-primary bg-primary/15 text-primary shadow-[0_0_8px_rgba(212,175,55,0.25)]'
                              : 'border-border/40 text-muted-foreground hover:border-primary/30 hover:bg-white/5'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Hair color */}
                  <ColorRow
                    label="Цвет волос"
                    colors={HAIR_COLORS}
                    selected={localAvatar.hairColor}
                    onSelect={(hex) => setLocalAvatar(a => ({ ...a, hairColor: hex }))}
                  />

                  {/* Robe color */}
                  <ColorRow
                    label="Цвет мантии"
                    colors={ROBE_COLORS}
                    selected={localAvatar.robeColor}
                    onSelect={(hex) => setLocalAvatar(a => ({ ...a, robeColor: hex }))}
                  />

                  {/* Eye color */}
                  <ColorRow
                    label="Цвет глаз"
                    colors={EYE_COLORS}
                    selected={localAvatar.eyeColor}
                    onSelect={(hex) => setLocalAvatar(a => ({ ...a, eyeColor: hex }))}
                  />

                  <button
                    onClick={handleSaveAvatar}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm shadow-md"
                  >
                    Сохранить аватар
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3 py-2.5 border-b border-border/40">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}

function ColorRow({
  label, colors, selected, onSelect
}: {
  label: string;
  colors: { id: string; label: string; hex: string }[];
  selected: string;
  onSelect: (hex: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex gap-2.5 flex-wrap">
        {colors.map(c => (
          <button
            key={c.id}
            title={c.label}
            onClick={() => onSelect(c.hex)}
            className="relative w-8 h-8 rounded-full border-2 transition-all"
            style={{
              backgroundColor: c.hex,
              borderColor: selected === c.hex ? '#D4AF37' : 'transparent',
              boxShadow: selected === c.hex ? `0 0 8px ${c.hex}80` : 'none',
            }}
          >
            {selected === c.hex && (
              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
