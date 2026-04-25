import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, MapPin, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthHeaders } from '@/lib/session';

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  mode?: 'create' | 'edit';
  initialContact?: {
    id: number;
    name: string;
    relation?: string | null;
    birthDate: string;
    birthTime?: string | null;
    birthPlace?: string | null;
    birthLat?: number | null;
    birthLng?: number | null;
    avatarConfig?: unknown;
  } | null;
  onDeleted?: () => void;
}

const RELATIONS = ["партнёр", "муж", "жена", "подруга", "друг", "начальник", "коллега", "родитель", "ребёнок", "другое"];

export default function AddContactModal({
  open,
  onClose,
  onAdded,
  mode = 'create',
  initialContact = null,
  onDeleted,
}: AddContactModalProps) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeSuggestions, setPlaceSuggestions] = useState<Array<{ label: string; lat: number; lng: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && initialContact) {
      setName(initialContact.name ?? '');
      setRelation(initialContact.relation ?? '');
      setBirthDate(initialContact.birthDate ?? '');
      setBirthTime(initialContact.birthTime ?? '');
      setBirthPlace(initialContact.birthPlace ?? '');
      if (
        typeof initialContact.birthLat === 'number' &&
        typeof initialContact.birthLng === 'number'
      ) {
        setCoords({ lat: initialContact.birthLat, lng: initialContact.birthLng });
      } else {
        setCoords(null);
      }
    } else {
      setName('');
      setRelation('');
      setBirthDate('');
      setBirthTime('');
      setBirthPlace('');
      setCoords(null);
    }
    setError('');
    setPlaceSuggestions([]);
    setShowSuggestions(false);
  }, [open, mode, initialContact]);

  useEffect(() => {
    const query = birthPlace.trim();
    if (query.length < 2) {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setGeocoding(true);
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=0`,
          { signal: controller.signal },
        );
        const d = (await r.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
        const options = (Array.isArray(d) ? d : [])
          .filter((x) => x?.display_name && x?.lat && x?.lon)
          .map((x) => ({
            label: String(x.display_name),
            lat: parseFloat(String(x.lat)),
            lng: parseFloat(String(x.lon)),
          }))
          .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
          .slice(0, 5);
        setPlaceSuggestions(options);
        setShowSuggestions(options.length > 0);
      } catch {
        if (!controller.signal.aborted) {
          setPlaceSuggestions([]);
          setShowSuggestions(false);
        }
      } finally {
        if (!controller.signal.aborted) setGeocoding(false);
      }
    }, 280);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [birthPlace]);

  const geocodePlace = async (place: string) => {
    if (!place.trim()) return;
    setGeocoding(true);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`,
      );
      const d = await r.json();
      if (d[0]) setCoords({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) });
    } catch {
      /* ignore */
    }
    setGeocoding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !birthDate) {
      setError('Имя и дата рождения обязательны');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        mode === 'edit' && initialContact ? `/api/contacts/${initialContact.id}` : '/api/contacts',
        {
          method: mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            name: name.trim(),
            relation: relation || null,
            birthDate,
            birthTime: birthTime || null,
            birthPlace: birthPlace || null,
            birthLat: coords?.lat ?? null,
            birthLng: coords?.lng ?? null,
          }),
        },
      );
      if (!res.ok) throw new Error('Ошибка сохранения');
      setName('');
      setRelation('');
      setBirthDate('');
      setBirthTime('');
      setBirthPlace('');
      setCoords(null);
      onAdded();
      onClose();
    } catch {
      setError('Не удалось сохранить. Попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!initialContact) return;
    const confirmed =
      typeof window !== 'undefined'
        ? window.confirm(`Удалить контакт «${initialContact.name}»?`)
        : true;
    if (!confirmed) return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/contacts/${initialContact.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Ошибка удаления');
      onDeleted?.();
      onClose();
    } catch {
      setError('Не удалось удалить контакт. Попробуйте снова.');
    } finally {
      setDeleting(false);
    }
  };

  if (!portalReady || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/*
            Без translateY на панели: на iOS/WebKit инпуты внутри transform часто не получают фокус/клавиатуру.
            Портал в body — вне overflow:hidden у AppLayout.
          */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg max-h-[min(92dvh,720px)] flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-contact-title"
          >
            <div className="shrink-0 flex items-center justify-between border-b border-border/50 px-5 py-4">
              <h3 id="add-contact-title" className="text-lg font-display font-semibold pr-2">
                {mode === 'edit' ? 'Редактировать человека' : 'Добавить человека'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/5 text-muted-foreground shrink-0 touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] touch-pan-y">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div
                  className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1.5 leading-relaxed"
                  role="note"
                >
                  <p>
                    По умолчанию Астробот разбирает характер человека и вашу связь прямо сейчас. За каждый вопрос
                    спишется 1 запрос.
                  </p>
                  <p>
                    Но АстроБот может больше - включите галочку в чате с человеком и вы получите прогноз на
                    несколько лет, углубленный анализ, детали. Каждый вопрос = 2 или 3 запроса (в зависимости от
                    объема).
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Имя *</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Например, сын Миша"
                      autoComplete="name"
                      enterKeyHint="next"
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Кто это</label>
                    <select
                      value={relation}
                      onChange={(e) => setRelation(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base text-foreground outline-none focus:border-primary/50"
                    >
                      <option value="">— выберите —</option>
                      {RELATIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Дата рождения *</label>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full min-h-[48px] bg-background border border-border rounded-xl px-4 py-3 text-base text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Время рождения</label>
                    <input
                      type="time"
                      value={birthTime}
                      onChange={(e) => setBirthTime(e.target.value)}
                      className="w-full min-h-[48px] bg-background border border-border rounded-xl px-4 py-3 text-base text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Место рождения</label>
                    <div className="relative">
                      <input
                        value={birthPlace}
                        onChange={(e) => {
                          setBirthPlace(e.target.value);
                          setCoords(null);
                        }}
                        onBlur={() => {
                          setTimeout(() => setShowSuggestions(false), 120);
                          if (!coords) void geocodePlace(birthPlace);
                        }}
                        onFocus={() => {
                          if (placeSuggestions.length > 0) setShowSuggestions(true);
                        }}
                        placeholder="Город, страна"
                        autoComplete="off"
                        enterKeyHint="done"
                        className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-11 text-base text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {geocoding ? (
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : coords ? (
                          <MapPin className="w-4 h-4 text-green-400" />
                        ) : (
                          <MapPin className="w-4 h-4 text-muted-foreground/40" />
                        )}
                      </div>
                    </div>
                    {showSuggestions && (
                      <div className="mt-1 rounded-xl border border-border bg-card/95 max-h-44 overflow-y-auto">
                        {placeSuggestions.map((s, idx) => (
                          <button
                            key={`${s.label}-${idx}`}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setBirthPlace(s.label);
                              setCoords({ lat: s.lat, lng: s.lng });
                              setShowSuggestions(false);
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition border-b border-border/40 last:border-b-0"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {coords && (
                      <p className="text-xs text-green-400/80 mt-1">
                        Координаты: {coords.lat.toFixed(2)}°, {coords.lng.toFixed(2)}°
                      </p>
                    )}
                  </div>
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2">
                  <button
                    type="submit"
                    disabled={loading || deleting}
                    className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors touch-manipulation min-h-[48px]"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    ) : mode === 'edit' ? (
                      'Сохранить изменения'
                    ) : (
                      'Добавить'
                    )}
                  </button>
                  {mode === 'edit' && (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={loading || deleting}
                      className="w-full py-3.5 bg-destructive/15 text-destructive border border-destructive/40 rounded-xl font-semibold hover:bg-destructive/25 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2 touch-manipulation min-h-[48px]"
                    >
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Удалить
                    </button>
                  )}
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
