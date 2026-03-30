import React, { useState } from 'react';
import { X, Loader2, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthHeaders } from '@/lib/session';

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const RELATIONS = ["партнёр", "муж", "жена", "подруга", "друг", "начальник", "коллега", "родитель", "ребёнок", "другое"];

export default function AddContactModal({ open, onClose, onAdded }: AddContactModalProps) {
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [coords, setCoords] = useState<{lat: number; lng: number} | null>(null);

  const geocodePlace = async (place: string) => {
    if (!place.trim()) return;
    setGeocoding(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`);
      const d = await r.json();
      if (d[0]) setCoords({ lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) });
    } catch {}
    setGeocoding(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !birthDate) { setError('Имя и дата рождения обязательны'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: name.trim(), relation: relation || null,
          birthDate, birthTime: birthTime || null,
          birthPlace: birthPlace || null,
          birthLat: coords?.lat ?? null, birthLng: coords?.lng ?? null,
        }),
      });
      if (!res.ok) throw new Error('Ошибка сохранения');
      setName(''); setRelation(''); setBirthDate(''); setBirthTime('');
      setBirthPlace(''); setCoords(null);
      onAdded();
      onClose();
    } catch (err) {
      setError('Не удалось сохранить. Попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-lg bg-card border border-border rounded-t-2xl p-6 pb-safe"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-display font-semibold">Добавить человека</h3>
              <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-muted-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Имя *</label>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="Александра"
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Кто это</label>
                  <select
                    value={relation} onChange={e => setRelation(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                  >
                    <option value="">— выберите —</option>
                    {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Дата рождения *</label>
                  <input
                    type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Время рождения</label>
                  <input
                    type="time" value={birthTime} onChange={e => setBirthTime(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground outline-none focus:border-primary/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Место рождения</label>
                  <div className="relative">
                    <input
                      value={birthPlace} onChange={e => setBirthPlace(e.target.value)}
                      onBlur={() => geocodePlace(birthPlace)}
                      placeholder="Москва"
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-10 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {geocoding
                        ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        : coords
                        ? <MapPin className="w-4 h-4 text-green-400" />
                        : <MapPin className="w-4 h-4 text-muted-foreground/40" />
                      }
                    </div>
                  </div>
                  {coords && (
                    <p className="text-xs text-green-400/80 mt-1">
                      Координаты: {coords.lat.toFixed(2)}°, {coords.lng.toFixed(2)}°
                    </p>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="submit" disabled={loading}
                className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Добавить'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
