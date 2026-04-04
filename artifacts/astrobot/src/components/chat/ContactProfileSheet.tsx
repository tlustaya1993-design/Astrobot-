import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Pencil, Save, Trash2, X } from 'lucide-react';
import { DEFAULT_AVATAR, type AvatarConfig } from '@/components/ui/AstroAvatar';
import IllustratedAvatar, { resolveAvatarImage } from '@/components/ui/IllustratedAvatar';
import { getAuthHeaders } from '@/lib/session';
import type { Contact } from './PeoplePanel';
import AvatarEditor from '@/components/ui/AvatarEditor';

function normalizeAvatarConfig(input: unknown): AvatarConfig {
  if (!input || typeof input !== 'object') return DEFAULT_AVATAR;
  const v = input as Record<string, unknown>;
  const archetype = v.archetype === 'cosmonaut' || v.archetype === 'mage' || v.archetype === 'galactic'
    ? v.archetype
    : DEFAULT_AVATAR.archetype;
  const hairStyleRaw = typeof v.hairStyle === 'string' ? v.hairStyle : DEFAULT_AVATAR.hairStyle;
  const hairColorRaw = typeof v.hairColor === 'string' ? v.hairColor : DEFAULT_AVATAR.hairColor;
  const allowedGalacticStyles = new Set(['short', 'medium', 'long', 'curly']);
  const allowedGalacticColors = new Set(['#F0C040', '#7B3F1E', '#C0392B']);
  const hairStyle = archetype === 'galactic' && !allowedGalacticStyles.has(hairStyleRaw)
    ? 'medium'
    : hairStyleRaw;
  const hairColor = archetype === 'galactic' && !allowedGalacticColors.has(hairColorRaw.toUpperCase())
    ? '#7B3F1E'
    : hairColorRaw;
  return {
    archetype,
    hairStyle,
    hairColor,
    robeColor: typeof v.robeColor === 'string' ? v.robeColor : DEFAULT_AVATAR.robeColor,
    eyeColor: typeof v.eyeColor === 'string' ? v.eyeColor : DEFAULT_AVATAR.eyeColor,
  };
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

interface ContactProfileSheetProps {
  open: boolean;
  contact: Contact | null;
  onClose: () => void;
  onUpdated: (contact: Contact) => void;
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
  const asHexColor = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback;
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  };
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

  const hairColorByName = useMemo(
    () =>
      new Map([
        ['блонд', '#F0C040'],
        ['блондинка', '#F0C040'],
        ['brunette', '#7B3F1E'],
        ['брюнетка', '#7B3F1E'],
        ['рыжая', '#C0392B'],
      ]),
    [],
  );
  const hairStyleByName = useMemo(
    () =>
      new Map([
        ['короткие', 'short'],
        ['средние', 'medium'],
        ['длинные', 'long'],
        ['кудрявые', 'curly'],
      ]),
    [],
  );

  useEffect(() => {
    if (!open || !contact) return;
    setSection('view');
    setError(null);
    setAvatarConfig(normalizeAvatarConfig(contact.avatarConfig));
    setName(contact.name ?? '');
    setRelation(contact.relation ?? '');
    setBirthDate(contact.birthDate ?? '');
    setBirthTime(contact.birthTime ?? '');
    setBirthPlace(contact.birthPlace ?? '');
    setBirthLat(typeof contact.birthLat === 'number' ? String(contact.birthLat) : '');
    setBirthLng(typeof contact.birthLng === 'number' ? String(contact.birthLng) : '');
  }, [open, contact]);

  useEffect(() => {
    if (!contact || !contact.relation) return;
    const relationLower = contact.relation.toLowerCase();
    const suggestedHairColor = [...hairColorByName.entries()].find(([token]) =>
      relationLower.includes(token),
    )?.[1];
    const suggestedHairStyle = [...hairStyleByName.entries()].find(([token]) =>
      relationLower.includes(token),
    )?.[1];
    if (!suggestedHairColor && !suggestedHairStyle) return;
    setAvatarConfig((prev) => ({
      ...prev,
      hairColor: asHexColor(suggestedHairColor, prev.hairColor),
      hairStyle: typeof suggestedHairStyle === 'string' ? suggestedHairStyle : prev.hairStyle,
    }));
  }, [contact, hairColorByName, hairStyleByName]);

  const avatarPreview = useMemo(() => avatarConfig, [avatarConfig]);

  const handleSaveAvatar = async () => {
    if (!contact) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/avatar`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ avatarConfig }),
      });
      if (!res.ok) throw new Error('Не удалось сохранить аватар');
      const updated = await res.json() as Contact;
      onUpdated(updated);
      setSection('view');
    } catch {
      setError('Не удалось сохранить аватар');
    } finally {
      setLoading(false);
    }
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
      const updated = await res.json() as Contact;
      onUpdated(updated);
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
            <div className="relative w-full max-w-2xl bg-card border-t border-border rounded-t-3xl shadow-2xl overflow-visible">
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

              {section === 'avatar' && (
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-12 md:-top-20 z-10">
                  <div className="relative rounded-full border-[4px] border-primary/75 shadow-[0_0_44px_rgba(212,175,55,0.36)] bg-[#08081a] w-[220px] h-[220px] md:w-[274px] md:h-[274px] overflow-hidden">
                    <img
                      src={resolveAvatarImage(avatarConfig)}
                      alt="Аватар контакта"
                      className="w-full h-full object-cover scale-[1.34] origin-center object-[50%_22%]"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 rounded-full ring-1 ring-white/10 pointer-events-none" />
                  </div>
                </div>
              )}

              {section === 'view' && (
                <div className="px-5 pb-8 space-y-5 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <IllustratedAvatar config={avatarPreview} size={80} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold font-display truncate">{contact.name}</p>
                      <p className="text-sm text-primary/80">{contact.relation || 'контакт'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">ID: {initials(contact.name)}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSection('avatar')}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/35 text-primary text-sm font-medium hover:bg-primary/10 transition"
                  >
                    <Pencil className="w-4 h-4" />
                    Редактировать аватар
                  </button>

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
                <div className="px-5 pb-8 pt-[10.25rem] md:pt-[12.5rem] space-y-5 max-h-[75vh] overflow-y-auto overflow-x-visible">
                  <AvatarEditor
                    value={avatarConfig}
                    onChange={setAvatarConfig}
                    onSave={handleSaveAvatar}
                    saving={loading}
                  />
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
