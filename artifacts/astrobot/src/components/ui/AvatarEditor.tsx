import React, { useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  AVATAR_PRESETS,
  DEFAULT_AVATAR,
  EYE_COLORS,
  GALACTIC_ALLOWED_HAIR_COLORS,
  GALACTIC_ALLOWED_HAIR_STYLES,
  HAIR_COLORS,
  HAIR_STYLES,
  type AvatarConfig,
} from '@/components/ui/AstroAvatar';

interface AvatarEditorProps {
  value?: AvatarConfig;
  avatarConfig?: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
}

const GALACTIC_VARIANT_IMAGES = [
  '/avatar-presets/miss-galactica/galactic-short-blonde.webp',
  '/avatar-presets/miss-galactica/galactic-short-brunette.webp',
  '/avatar-presets/miss-galactica/galactic-short-red.webp',
  '/avatar-presets/miss-galactica/galactic-medium-blonde.webp',
  '/avatar-presets/miss-galactica/galactic-medium-brunette.webp',
  '/avatar-presets/miss-galactica/galactic-medium-red.webp',
  '/avatar-presets/miss-galactica/galactic-long-blonde.webp',
  '/avatar-presets/miss-galactica/galactic-long-brunette.webp',
  '/avatar-presets/miss-galactica/galactic-long-red.webp',
  '/avatar-presets/miss-galactica/galactic-curly-blonde.webp',
  '/avatar-presets/miss-galactica/galactic-curly-brunette.webp',
  '/avatar-presets/miss-galactica/galactic-curly-red.webp',
];

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
      <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</p>
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

export default function AvatarEditor({
  value,
  avatarConfig,
  onChange,
  onSave,
  saving = false,
  saveLabel = 'Сохранить аватар',
}: AvatarEditorProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Mobile freeze fix: do not preload all 12 heavy images at once.
    for (const src of GALACTIC_VARIANT_IMAGES.slice(0, 4)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    }
  }, []);

  const current = value ?? avatarConfig ?? DEFAULT_AVATAR;
  const archetype = current.archetype ?? DEFAULT_AVATAR.archetype ?? 'mage';
  const hairStyles = HAIR_STYLES.filter((s) => ['short', 'medium', 'long', 'curly'].includes(s.id));
  const isGalactic = archetype === 'galactic';
  const visibleHairStyles = isGalactic
    ? hairStyles.filter((s) => GALACTIC_ALLOWED_HAIR_STYLES.includes(s.id as (typeof GALACTIC_ALLOWED_HAIR_STYLES)[number]))
    : hairStyles;
  const visibleHairColors = isGalactic
    ? HAIR_COLORS.filter((c) =>
        GALACTIC_ALLOWED_HAIR_COLORS.includes(c.hex as (typeof GALACTIC_ALLOWED_HAIR_COLORS)[number]),
      )
    : HAIR_COLORS;

  const presets = AVATAR_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.id === 'galactic_default'
      ? 'Мисс Галактика'
      : preset.id === 'cosmonaut_default'
      ? 'Космонавтка'
      : 'Волшебница',
    image:
      preset.id === 'galactic_default'
        ? '/avatar-presets/miss-galactica/galactic-medium-brunette.webp'
        : preset.id === 'cosmonaut_default'
        ? '/avatar-presets/cosmonautka.png'
        : '/avatar-presets/volshebnitsa.png',
    cfg: {
      ...current,
      ...preset.config,
    } satisfies AvatarConfig,
  }));

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Готовые персонажи</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {presets.map((p) => {
            const selected = archetype === p.cfg.archetype;
            return (
              <button
                key={p.id}
                onClick={() => {
                  onChange(p.cfg);
                  if (p.cfg.archetype === 'galactic') {
                    for (const src of GALACTIC_VARIANT_IMAGES) {
                      const img = new Image();
                      img.decoding = 'async';
                      img.src = src;
                    }
                  }
                }}
                className={`rounded-2xl border p-2 text-left transition-all ${
                  selected
                    ? 'border-primary bg-primary/15 shadow-[0_0_18px_rgba(212,175,55,0.24)]'
                    : 'border-border/40 hover:border-primary/40 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 shadow-[0_0_10px_rgba(212,175,55,0.28)]">
                    <img
                      src={p.image}
                      alt={p.label}
                      className="w-full h-full object-cover scale-[1.35] origin-center object-[50%_34%]"
                      loading="eager"
                    />
                  </div>
                  <span className={`text-xs font-medium ${selected ? 'text-primary' : 'text-foreground'}`}>
                    {p.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Причёска</p>
        <div className="grid grid-cols-4 gap-2">
          {visibleHairStyles.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange({ ...current, hairStyle: s.id })}
              className={`py-2 px-1 rounded-xl text-xs font-medium border transition-all ${
                current.hairStyle === s.id
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
        label={isGalactic ? 'Цвет волос (3 варианта)' : 'Цвет волос'}
        colors={visibleHairColors}
        selected={current.hairColor}
        onSelect={(hex) => onChange({ ...current, hairColor: hex })}
      />
      <ColorRow
        label="Цвет глаз"
        colors={EYE_COLORS}
        selected={current.eyeColor}
        onSelect={(hex) => onChange({ ...current, eyeColor: hex })}
      />

      {onSave && (
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm shadow-md inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saveLabel}
        </button>
      )}
    </div>
  );
}
