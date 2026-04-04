import React from 'react';
import { Loader2, Save } from 'lucide-react';
import AstroAvatar, {
  AVATAR_PRESETS,
  DEFAULT_AVATAR,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  ROBE_COLORS,
  type AvatarConfig,
} from '@/components/ui/AstroAvatar';

interface AvatarEditorProps {
  value?: AvatarConfig;
  avatarConfig?: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  previewSize?: number;
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
  previewSize = 136,
}: AvatarEditorProps) {
  const current = value ?? avatarConfig ?? DEFAULT_AVATAR;
  const archetype = current.archetype ?? DEFAULT_AVATAR.archetype ?? 'mage';

  const presets = AVATAR_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.id === 'galactic_default'
      ? 'Мисс Галактика'
      : preset.id === 'cosmonaut_default'
      ? 'Космонавтка'
      : 'Волшебница',
    image:
      preset.id === 'galactic_default'
        ? '/avatar-presets/miss-galactica.png'
        : preset.id === 'cosmonaut_default'
        ? '/avatar-presets/cosmonautka.png'
        : '/avatar-presets/volshebnitsa.png',
    cfg: {
      ...current,
      ...preset.config,
    } satisfies AvatarConfig,
  }));

  const activePreset = presets.find((p) => p.cfg.archetype === archetype) ?? presets[0];

  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div
          className="relative rounded-full overflow-hidden border-[3px] border-primary/60 shadow-[0_0_38px_rgba(212,175,55,0.28)] bg-[#08081a]"
          style={{ width: previewSize, height: previewSize }}
        >
          <img
            src={activePreset.image}
            alt={activePreset.label}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 ring-1 ring-white/10 rounded-full pointer-events-none" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Готовые персонажи</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {presets.map((p) => {
            const selected = archetype === p.cfg.archetype;
            return (
              <button
                key={p.id}
                onClick={() => onChange(p.cfg)}
                className={`rounded-2xl border p-2 text-left transition-all ${
                  selected
                    ? 'border-primary bg-primary/15 shadow-[0_0_18px_rgba(212,175,55,0.24)]'
                    : 'border-border/40 hover:border-primary/40 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-primary/45 shrink-0 shadow-[0_0_10px_rgba(212,175,55,0.28)]">
                    <img
                      src={p.image}
                      alt={p.label}
                      className="w-full h-full object-cover"
                      loading="lazy"
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
        <div className="grid grid-cols-3 gap-2">
          {HAIR_STYLES.map((s) => (
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
        label="Цвет волос"
        colors={HAIR_COLORS}
        selected={current.hairColor}
        onSelect={(hex) => onChange({ ...current, hairColor: hex })}
      />
      <ColorRow
        label={archetype === 'cosmonaut' ? 'Цвет костюма' : 'Цвет мантии'}
        colors={ROBE_COLORS}
        selected={current.robeColor}
        onSelect={(hex) => onChange({ ...current, robeColor: hex })}
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
