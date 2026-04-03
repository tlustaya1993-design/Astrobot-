import React from 'react';
import { Loader2, Save } from 'lucide-react';
import AstroAvatar, {
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  ROBE_COLORS,
  type AvatarConfig,
} from '@/components/ui/AstroAvatar';

interface AvatarEditorProps {
  value: AvatarConfig;
  onChange: (next: AvatarConfig) => void;
  onSave: () => void;
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
  onChange,
  onSave,
  saving = false,
  saveLabel = 'Сохранить аватар',
  previewSize = 136,
}: AvatarEditorProps) {
  return (
    <div className="px-5 pb-8 space-y-5 max-h-[75vh] overflow-y-auto">
      <div className="flex justify-center">
        <div
          className="rounded-full overflow-hidden border-2 border-primary/40 shadow-[0_0_24px_rgba(212,175,55,0.25)]"
          style={{ width: previewSize, height: previewSize }}
        >
          <AstroAvatar config={value} size={previewSize} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Причёска</p>
        <div className="grid grid-cols-3 gap-2">
          {HAIR_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => onChange({ ...value, hairStyle: s.id })}
              className={`py-2 px-1 rounded-xl text-xs font-medium border transition-all ${
                value.hairStyle === s.id
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
        selected={value.hairColor}
        onSelect={(hex) => onChange({ ...value, hairColor: hex })}
      />
      <ColorRow
        label="Цвет мантии"
        colors={ROBE_COLORS}
        selected={value.robeColor}
        onSelect={(hex) => onChange({ ...value, robeColor: hex })}
      />
      <ColorRow
        label="Цвет глаз"
        colors={EYE_COLORS}
        selected={value.eyeColor}
        onSelect={(hex) => onChange({ ...value, eyeColor: hex })}
      />

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold text-sm shadow-md inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saveLabel}
      </button>
    </div>
  );
}
