import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Pencil, Save, Trash2, X } from 'lucide-react';
import AstroAvatar, {
  DEFAULT_AVATAR,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  ROBE_COLORS,
  type AvatarConfig,
} from '@/components/ui/AstroAvatar';
import { getAuthHeaders } from '@/lib/session';
import type { Contact } from './PeoplePanel';

const CONTACT_AVATAR_PREFIX = 'astrobot_contact_avatar_';

function getStorageKey(contactId: number): string {
  return `${CONTACT_AVATAR_PREFIX}${contactId}`;
}

function loadContactAvatar(contactId: number): AvatarConfig {
  try {
    const raw = localStorage.getItem(getStorageKey(contactId));
    if (!raw) return DEFAULT_AVATAR;
    return { ...DEFAULT_AVATAR, ...JSON.parse(raw) } as AvatarConfig;
  } catch {
    return DEFAULT_AVATAR;
  }
}

function saveContactAvatar(contactId: number, cfg: AvatarConfig): void {
  localStorage.setItem(getStorageKey(contactId), JSON.stringify(cfg));
}

function formatBirthDate(input: string): string {
  try {
    const date = new Date(input);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return input;
  }
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ColorRow({
  label,
  colors,
  selected,
  onSelect,
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
        {colors.map((c) => (
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

interface ContactProfileSheetProps {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: (id: number) => void;
}

type Section = 'view' | 'avatar' | 'edit';

export default function ContactProfileSheet({
  open,
  contact,
  onClose,
  onUpdated,
  onDeleted,
}: ContactProfileSheetProps) {
  const [section, setSection] = useState<Section>('view');
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [birthLat, setBirthLat] = useState<string>('');
  const [birthLng, setBirthLng] = useState<string>('');

  useEffect(() => {
    if (!open || !contact) return;
    setSection('view');
    setError(null);
    setAvatarConfig(loadContactAvatar(contact.id));
    setName(contact.name ?? '');
    setRelation(contact.relation ?? '');
    setBirthDate(contact.birthDate ?? '');
    setBirthTime(contact.birthTime ?? '');
    setBirthPlace(contact.birthPlace ?? '');
    setBirthLat(typeof contact.birthLat === 'number' ? String(contact.birthLat) : '');
    setBirthLng(typeof contact.birthLng === 'number' ? String(contact.birthLng) : '');
  }, [open, contact]);

  const avatarPreview = useMemo(() => avatarConfig, [avatarConfig]);

  const handleSaveAvatar = () => {
    if (!contact) return;
    saveContactAvatar(contact.id, avatarConfig);
    setSection('view');
  };

  const handleSaveProfile = async () => {
    if (!contact) return;
    if (!name.trim() || !birthDate.trim()) {
      setError('Имя и дата рождения обязательны');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          name: name.trim(),
          relation: relation.trim() || null,
          birthDate: birthDate.trim(),
          birthTime: birthTime.trim() || null,
          birthPlace: birthPlace.trim() || null,
          birthLat: birthLat.trim() ? Number(birthLat) : null,
          birthLng: birthLng.trim() ? Number(birthLng) : null,
        }),
      });
      if (!res.ok) throw new Error('Не удалось сохранить');
      onUpdated();
      setSection('view');
    } catch {
      setError('Не удалось сохранить изменения');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!contact) return;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Удалить контакт «${contact.name}»?`)
      : true;
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Ошибка удаления');
      onDeleted(contact.id);
      onClose();
    } catch {
      setError('Не удалось удалить контакт');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && contact && (
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
            <div className="w-full max-w-2xl bg-card border-t border-border rounded-t-3xl overflow-hidden shadow-2xl">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                {section === 'view' ? (
                  <span className="text-base font-semibold font-display">Профиль контакта</span>
                ) : (
                  <button
                    onClick={() => setSection('view')}
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    ← Назад
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 transition">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {section === 'view' && (
                <div className="px-5 pb-8 space-y-5 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/40 shadow-[0_0_16px_rgba(212,175,55,0.2)]">
                        <AstroAvatar config={avatarPreview} size={80} />
                      </div>
                      <button
                        onClick={() => setSection('avatar')}
                        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/80 transition"
                        aria-label="Редактировать аватар"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold font-display truncate">{contact.name}</p>
                      <p className="text-sm text-primary/80">{contact.relation || 'контакт'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">ID: {initials(contact.name)}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-3 py-2.5 border-b border-border/40">
                      <span className="text-sm text-muted-foreground shrink-0">Дата рождения</span>
                      <span className="text-sm text-foreground text-right">{formatBirthDate(contact.birthDate)}</span>
                    </div>
                    {contact.birthTime && (
                      <div className="flex justify-between items-start gap-3 py-2.5 border-b border-border/40">
                        <span className="text-sm text-muted-foreground shrink-0">Время рождения</span>
                        <span className="text-sm text-foreground text-right">{contact.birthTime}</span>
                      </div>
                    )}
                    {contact.birthPlace && (
                      <div className="flex justify-between items-start gap-3 py-2.5 border-b border-border/40">
                        <span className="text-sm text-muted-foreground shrink-0">Место рождения</span>
                        <span className="text-sm text-foreground text-right">{contact.birthPlace}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => setSection('edit')}
                      className="w-full py-2.5 rounded-xl border border-primary/40 text-primary text-sm font-medium hover:bg-primary/10 transition inline-flex items-center justify-center gap-2"
                    >
                      <Pencil className="w-4 h-4" />
                      Редактировать
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="w-full py-2.5 rounded-xl border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Удалить
                    </button>
                  </div>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                </div>
              )}

              {section === 'avatar' && (
                <div className="px-5 pb-8 space-y-5 max-h-[75vh] overflow-y-auto">
                  <div className="flex justify-center">
                    <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-primary/40 shadow-[0_0_20px_rgba(212,175,55,0.2)]">
                      <AstroAvatar config={avatarPreview} size={112} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Причёска</p>
                    <div className="grid grid-cols-3 gap-2">
                      {HAIR_STYLES.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setAvatarConfig((a) => ({ ...a, hairStyle: s.id }))}
                          className={`py-2 px-1 rounded-xl text-xs font-medium border transition-all ${
                            avatarConfig.hairStyle === s.id
                              ? 'border-primary bg-primary/15 text-primary shadow-[0_0_8px_rgba(212,175,55,0.25)]'
                              : 'border-border/40 text-muted-foreground hover:border-primary/30 hover:bg-white/5'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <ColorRow
                    label="Цвет волос"
                    colors={HAIR_COLORS}
                    selected={avatarConfig.hairColor}
                    onSelect={(hex) => setAvatarConfig((a) => ({ ...a, hairColor: hex }))}
                  />
                  <ColorRow
                    label="Цвет мантии"
                    colors={ROBE_COLORS}
                    selected={avatarConfig.robeColor}
                    onSelect={(hex) => setAvatarConfig((a) => ({ ...a, robeColor: hex }))}
                  />
                  <ColorRow
                    label="Цвет глаз"
                    colors={EYE_COLORS}
                    selected={avatarConfig.eyeColor}
                    onSelect={(hex) => setAvatarConfig((a) => ({ ...a, eyeColor: hex }))}
                  />

                  <button
                    onClick={handleSaveAvatar}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm shadow-md inline-flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Сохранить аватар
                  </button>
                </div>
              )}

              {section === 'edit' && (
                <div className="px-5 pb-8 space-y-4 max-h-[75vh] overflow-y-auto">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Имя *</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Кто это</label>
                    <input
                      value={relation}
                      onChange={(e) => setRelation(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Дата рождения *</label>
                      <input
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Время рождения</label>
                      <input
                        type="time"
                        value={birthTime}
                        onChange={(e) => setBirthTime(e.target.value)}
                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Место рождения</label>
                    <input
                      value={birthPlace}
                      onChange={(e) => setBirthPlace(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Широта</label>
                      <input
                        value={birthLat}
                        onChange={(e) => setBirthLat(e.target.value)}
                        placeholder="55.75"
                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Долгота</label>
                      <input
                        value={birthLng}
                        onChange={(e) => setBirthLng(e.target.value)}
                        placeholder="37.62"
                        className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                      />
                    </div>
                  </div>

                  {error && <p className="text-sm text-red-400">{error}</p>}

                  <button
                    onClick={handleSaveProfile}
                    disabled={loading}
                    className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Сохранить изменения
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
