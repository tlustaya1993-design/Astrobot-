import React, { useId } from 'react';

export const HAIR_STYLES = [
  { id: 'short',     label: 'Короткие' },
  { id: 'medium',    label: 'Средние'  },
  { id: 'long',      label: 'Длинные'  },
  { id: 'curly',     label: 'Кудрявые' },
  { id: 'ponytail',  label: 'Хвостик'  },
  { id: 'bun',       label: 'Пучок'    },
];

export const HAIR_COLORS = [
  { id: 'black',  label: 'Чёрный',     hex: '#1c1c2e' },
  { id: 'brown',  label: 'Каштановый', hex: '#7B3F1E' },
  { id: 'blonde', label: 'Светлый',    hex: '#F0C040' },
  { id: 'red',    label: 'Рыжий',      hex: '#C0392B' },
  { id: 'silver', label: 'Серебряный', hex: '#A0AABB' },
  { id: 'violet', label: 'Лиловый',    hex: '#8B5CF6' },
];

export const ROBE_COLORS = [
  { id: 'indigo',  label: 'Индиго',     hex: '#3730A3' },
  { id: 'violet',  label: 'Фиолетовый', hex: '#6D28D9' },
  { id: 'navy',    label: 'Ночной',     hex: '#1E3A5F' },
  { id: 'forest',  label: 'Лесной',     hex: '#166534' },
  { id: 'crimson', label: 'Пурпурный',  hex: '#9B1C1C' },
  { id: 'teal',    label: 'Бирюзовый',  hex: '#0F766E' },
];

export const EYE_COLORS = [
  { id: 'brown',  label: 'Карие',     hex: '#7B4F2E' },
  { id: 'blue',   label: 'Голубые',   hex: '#3B82F6' },
  { id: 'green',  label: 'Зелёные',   hex: '#16A34A' },
  { id: 'amber',  label: 'Янтарные',  hex: '#D97706' },
  { id: 'violet', label: 'Сиреневые', hex: '#7C3AED' },
  { id: 'gray',   label: 'Серые',     hex: '#6B7280' },
];

export type AvatarArchetype = 'mage' | 'cosmonaut' | 'galactic';

export interface AvatarConfig {
  archetype?: AvatarArchetype;
  hairStyle: string;
  hairColor: string;
  robeColor: string;
  eyeColor: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  archetype: 'mage',
  hairStyle: 'medium',
  hairColor: HAIR_COLORS[0].hex,
  robeColor: ROBE_COLORS[0].hex,
  eyeColor: EYE_COLORS[1].hex,
};

export const AVATAR_PRESETS: Array<{
  id: string;
  label: string;
  config: AvatarConfig;
}> = [
  {
    id: 'galactic_default',
    label: 'Мисс Галактика',
    config: {
      ...DEFAULT_AVATAR,
      archetype: 'galactic',
      hairStyle: 'curly',
      hairColor: HAIR_COLORS[1].hex,
      robeColor: ROBE_COLORS[1].hex,
      eyeColor: EYE_COLORS[4].hex,
    },
  },
  {
    id: 'cosmonaut_default',
    label: 'Космонавтка',
    config: {
      ...DEFAULT_AVATAR,
      archetype: 'cosmonaut',
      hairStyle: 'medium',
      hairColor: HAIR_COLORS[1].hex,
      robeColor: ROBE_COLORS[2].hex,
      eyeColor: EYE_COLORS[1].hex,
    },
  },
  {
    id: 'mage_default',
    label: 'Волшебница',
    config: {
      ...DEFAULT_AVATAR,
      archetype: 'mage',
      hairStyle: 'long',
      hairColor: HAIR_COLORS[1].hex,
      robeColor: ROBE_COLORS[0].hex,
      eyeColor: EYE_COLORS[2].hex,
    },
  },
];

export const GALACTIC_ALLOWED_HAIR_STYLES = ['short', 'medium', 'long', 'curly'] as const;
export const GALACTIC_ALLOWED_HAIR_COLORS = [
  HAIR_COLORS[2].hex, // blonde
  HAIR_COLORS[1].hex, // brunette
  HAIR_COLORS[3].hex, // red
] as const;

/** Волшебница: те же 4 причёски и 3 цвета, что у «Мисс Галактика» (отдельные арты в /avatar-presets/mage/). */
export const MAGE_ALLOWED_HAIR_STYLES = GALACTIC_ALLOWED_HAIR_STYLES;
export const MAGE_ALLOWED_HAIR_COLORS = GALACTIC_ALLOWED_HAIR_COLORS;

const AVATAR_KEY = 'astrobot_avatar';

export function loadAvatar(): AvatarConfig {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (raw) return { ...DEFAULT_AVATAR, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_AVATAR;
}

export function saveAvatar(cfg: AvatarConfig) {
  localStorage.setItem(AVATAR_KEY, JSON.stringify(cfg));
}

interface Props {
  config?: AvatarConfig;
  size?: number;
  className?: string;
  /** Растянуть SVG на весь родительский круг (редактор / превью). */
  fillParent?: boolean;
}

export default function AstroAvatar({
  config = DEFAULT_AVATAR,
  size = 80,
  className = '',
  fillParent = false,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const ids = {
    clip: `c-${uid}`,
    skin: `sk-${uid}`,
    eye: `ey-${uid}`,
    bg: `bg-${uid}`,
    robe: `rb-${uid}`,
    hair: `hr-${uid}`,
  };

  const { hairStyle, hairColor, robeColor, eyeColor } = config;
  const hairShadow = shadeHex(hairColor, -35);
  const hairHi    = shadeHex(hairColor, 40);
  const robeDark  = shadeHex(robeColor, -35);
  const robeHi    = shadeHex(robeColor, 50);
  const eyeDark   = shadeHex(eyeColor, -30);

  return (
    <svg
      width={fillParent ? '100%' : size}
      height={fillParent ? '100%' : size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${fillParent ? 'block h-full w-full max-h-full max-w-full' : ''} ${className}`.trim()}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <clipPath id={ids.clip}><circle cx="50" cy="50" r="50" /></clipPath>

        {/* Skin gradient — Pixar subsurface look */}
        <radialGradient id={ids.skin} cx="42%" cy="38%" r="58%">
          <stop offset="0%"   stopColor="#FFE4C0" />
          <stop offset="60%"  stopColor="#F5C99A" />
          <stop offset="100%" stopColor="#E8A87C" />
        </radialGradient>

        {/* Eye iris gradient */}
        <radialGradient id={ids.eye} cx="35%" cy="30%" r="70%">
          <stop offset="0%"   stopColor={shadeHex(eyeColor, 50)} />
          <stop offset="55%"  stopColor={eyeColor} />
          <stop offset="100%" stopColor={eyeDark} />
        </radialGradient>

        {/* Background gradient */}
        <radialGradient id={ids.bg} cx="50%" cy="30%" r="70%">
          <stop offset="0%"   stopColor={shadeHex(robeColor, -10)} stopOpacity="0.5" />
          <stop offset="100%" stopColor="#060610" />
        </radialGradient>

        {/* Robe gradient */}
        <linearGradient id={ids.robe} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor={shadeHex(robeColor, 15)} />
          <stop offset="100%" stopColor={robeDark} />
        </linearGradient>

        {/* Hair gradient */}
        <radialGradient id={ids.hair} cx="40%" cy="25%" r="65%">
          <stop offset="0%"   stopColor={hairHi} />
          <stop offset="50%"  stopColor={hairColor} />
          <stop offset="100%" stopColor={hairShadow} />
        </radialGradient>
      </defs>

      <g clipPath={`url(#${ids.clip})`}>
        {/* Background */}
        <circle cx="50" cy="50" r="50" fill={`url(#${ids.bg})`} />
        <circle cx="50" cy="50" r="50" fill="#07071a" opacity="0.6" />

        {/* Background stars */}
        {[[18,15],[82,12],[12,62],[87,55],[55,7],[30,85],[70,80]].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r={i%2===0?0.9:0.6} fill="white" opacity={0.4+i*0.05} />
        ))}

        {/* ── BACK HAIR LAYER ─────────────────────────────── */}
        <HairBack style={hairStyle} color={hairColor} shadow={hairShadow} hi={hairHi} gradId={ids.hair} />

        {/* ── ROBE / SHOULDERS ────────────────────────────── */}
        <path d="M-8,118 L16,72 Q32,65 50,63 Q68,65 84,72 L108,118 Z" fill={`url(#${ids.robe})`} />
        {/* Robe inner shadow */}
        <path d="M16,72 Q32,65 50,63 Q68,65 84,72 L78,118 L22,118 Z" fill={robeDark} opacity="0.3" />
        {/* Collar V */}
        <path d="M44,64 L50,73 L56,64" fill={robeDark} opacity="0.7" />
        {/* Robe shine line */}
        <path d="M22,82 Q28,76 36,80" stroke={robeHi} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.45" />
        {/* Stars on robe */}
        <StarDot cx={30} cy={93} r={2.8} color="#FFD700" op={0.65} />
        <StarDot cx={70} cy={87} r={2.1} color="#FFD700" op={0.55} />
        <circle cx="50" cy="103" r="1.4" fill="#FFD700" opacity="0.5" />

        {/* ── NECK ─────────────────────────────────────────── */}
        <path d="M43,58 Q43,68 50,69 Q57,68 57,58 L57,63 Q57,66 50,66 Q43,66 43,63 Z" fill={`url(#${ids.skin})`} />
        <path d="M43,63 Q43,67 50,68 Q57,67 57,63" fill="#D9956A" opacity="0.25" />

        {/* ── HEAD ─────────────────────────────────────────── */}
        {/* Ear left */}
        <path d="M29,41 Q25,44 26,49 Q27,53 31,52 Q33,49 32,43 Z" fill={`url(#${ids.skin})`} />
        <path d="M30,44 Q27,46 28,50 Q29,51 31,50" stroke="#D9956A" strokeWidth="0.8" fill="none" opacity="0.6" />
        {/* Ear right */}
        <path d="M71,41 Q75,44 74,49 Q73,53 69,52 Q67,49 68,43 Z" fill={`url(#${ids.skin})`} />
        <path d="M70,44 Q73,46 72,50 Q71,51 69,50" stroke="#D9956A" strokeWidth="0.8" fill="none" opacity="0.6" />

        {/* Head shape — Pixar: round with slight jawline */}
        <path d="M31,42 Q30,28 50,25 Q70,28 69,42 Q70,56 62,62 Q56,66 50,66 Q44,66 38,62 Q30,56 31,42 Z" fill={`url(#${ids.skin})`} />

        {/* Cheek color */}
        <ellipse cx="36" cy="51" rx="6" ry="4.5" fill="#F87171" opacity="0.2" />
        <ellipse cx="64" cy="51" rx="6" ry="4.5" fill="#F87171" opacity="0.2" />

        {/* ── FRONT HAIR ───────────────────────────────────── */}
        <HairFront style={hairStyle} color={hairColor} shadow={hairShadow} hi={hairHi} gradId={ids.hair} />

        {/* ── EYEBROWS ─────────────────────────────────────── */}
        <path d="M34,36 Q40,33 46,35" stroke={hairShadow} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M54,35 Q60,33 66,36" stroke={hairShadow} strokeWidth="2.2" strokeLinecap="round" fill="none" />

        {/* ── EYES — Pixar style ───────────────────────────── */}
        {/* Left eye */}
        <PixarEye cx={40} cy={42} ey={`url(#${ids.eye})`} eyeColor={eyeColor} eyeDark={eyeDark} />
        {/* Right eye */}
        <PixarEye cx={60} cy={42} ey={`url(#${ids.eye})`} eyeColor={eyeColor} eyeDark={eyeDark} />

        {/* ── NOSE (Pixar: minimal, nostril hint) ─────────── */}
        <path d="M47.5,51.5 Q50,54 52.5,51.5" stroke="#C8845A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <circle cx="47" cy="51.5" r="1.1" fill="#C8845A" opacity="0.45" />
        <circle cx="53" cy="51.5" r="1.1" fill="#C8845A" opacity="0.45" />

        {/* ── MOUTH ────────────────────────────────────────── */}
        <path d="M43.5,57 Q50,62 56.5,57" stroke="#C8845A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M43.5,57 Q50,60 56.5,57" fill="#D9956A" opacity="0.18" />

        {/* Face highlight — Pixar forehead sheen */}
        <ellipse cx="47" cy="34" rx="7" ry="4" fill="white" opacity="0.1" transform="rotate(-10,47,34)" />
      </g>
    </svg>
  );
}

/* ── Pixar Eye component ────────────────────────────────────── */
function PixarEye({ cx, cy, ey, eyeColor, eyeDark }: { cx: number; cy: number; ey: string; eyeColor: string; eyeDark: string }) {
  return (
    <g>
      {/* Sclera */}
      <ellipse cx={cx} cy={cy} rx={7.5} ry={8} fill="white" />
      {/* Iris */}
      <ellipse cx={cx} cy={cy+0.5} rx={5.2} ry={5.8} fill={ey} />
      {/* Limbal ring */}
      <ellipse cx={cx} cy={cy+0.5} rx={5.2} ry={5.8} fill="none" stroke={eyeDark} strokeWidth="1.1" />
      {/* Pupil */}
      <ellipse cx={cx} cy={cy+0.5} rx={2.8} ry={3.1} fill="#060614" />
      {/* Main catchlight — large */}
      <ellipse cx={cx-2} cy={cy-2} rx={2} ry={1.7} fill="white" opacity="0.95" transform={`rotate(-20,${cx},${cy})`} />
      {/* Secondary catchlight — small */}
      <circle cx={cx+2.5} cy={cy+2} r={0.9} fill="white" opacity="0.7" />
      {/* Upper eyelid */}
      <path d={`M${cx-7.5},${cy} Q${cx-4},${cy-9} ${cx},${cy-9} Q${cx+4},${cy-9} ${cx+7.5},${cy}`} fill="#1a0e06" opacity="0.85" />
      {/* Eyelash lines */}
      <line x1={cx-7} y1={cy-1} x2={cx-9} y2={cy-3.5} stroke="#1a0e06" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1={cx+7} y1={cy-1} x2={cx+9} y2={cy-3.5} stroke="#1a0e06" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
      <line x1={cx} y1={cy-8.5} x2={cx} y2={cy-10.5} stroke="#1a0e06" strokeWidth="1.1" strokeLinecap="round" opacity="0.7" />
      {/* Lower eyelid subtle line */}
      <path d={`M${cx-6.5},${cy+1} Q${cx},${cy+8} ${cx+6.5},${cy+1}`} fill="none" stroke="#C8845A" strokeWidth="0.7" opacity="0.4" />
    </g>
  );
}

/* ── Hair: back layer (rendered behind head) ──────────────── */
function HairBack({ style, color, shadow, hi, gradId }: { style: string; color: string; shadow: string; hi: string; gradId: string }) {
  switch (style) {
    case 'long':
      return (
        <g>
          <path d="M29,40 Q20,55 22,90 L34,90 Q32,60 36,40 Z" fill={shadow} />
          <path d="M71,40 Q80,55 78,90 L66,90 Q68,60 64,40 Z" fill={shadow} />
          <path d="M30,40 Q22,54 24,90 L33,90 Q31,62 38,40 Z" fill={color} />
          <path d="M70,40 Q78,54 76,90 L67,90 Q69,62 62,40 Z" fill={color} />
          {/* Back top */}
          <ellipse cx="50" cy="27" rx="23" ry="16" fill={shadow} />
        </g>
      );
    case 'ponytail':
      return (
        <g>
          {/* Ponytail band area */}
          <path d="M55,46 Q65,42 68,55 Q66,70 60,90 L54,90 Q58,72 56,55 Z" fill={shadow} />
          <path d="M57,46 Q65,44 67,55 Q64,70 59,90 L55,90 Q58,70 57,55 Z" fill={color} />
          <ellipse cx="50" cy="27" rx="22" ry="15" fill={shadow} />
        </g>
      );
    case 'bun':
      return <ellipse cx="50" cy="27" rx="21" ry="14" fill={shadow} />;
    case 'curly':
      return (
        <g>
          <ellipse cx="50" cy="24" rx="27" ry="22" fill={shadow} />
          <ellipse cx="28" cy="38" rx="11" ry="16" fill={shadow} />
          <ellipse cx="72" cy="38" rx="11" ry="16" fill={shadow} />
        </g>
      );
    default:
      return <ellipse cx="50" cy="26" rx="22" ry="15" fill={shadow} />;
  }
}

/* ── Hair: front layer (rendered on top of face) ──────────── */
function HairFront({ style, color, shadow, hi, gradId }: { style: string; color: string; shadow: string; hi: string; gradId: string }) {
  switch (style) {
    case 'short':
      return (
        <g>
          {/* Tight cap */}
          <path d="M30,38 Q30,22 50,20 Q70,22 70,38 Q68,33 60,30 Q50,28 40,30 Q32,33 30,38 Z" fill={`url(#${gradId})`} />
          {/* Side temples */}
          <path d="M30,38 Q29,42 31,45" stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M70,38 Q71,42 69,45" stroke={color} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          {/* Highlight */}
          <ellipse cx="46" cy="25" rx="8" ry="4" fill={hi} opacity="0.35" transform="rotate(-8,46,25)" />
        </g>
      );

    case 'medium':
      return (
        <g>
          {/* Side flows */}
          <path d="M30,38 Q28,46 31,52" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" />
          <path d="M70,38 Q72,46 69,52" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" />
          {/* Main top */}
          <path d="M30,38 Q30,20 50,18 Q70,20 70,38 Q62,28 56,26 Q53,22 50,22 Q47,22 44,26 Q38,28 30,38 Z" fill={`url(#${gradId})`} />
          {/* Bangs sweep */}
          <path d="M34,34 Q42,24 54,25 Q60,26 64,30 Q56,27 50,27 Q44,28 34,34 Z" fill={shadow} opacity="0.45" />
          {/* Highlight */}
          <ellipse cx="46" cy="24" rx="9" ry="5" fill={hi} opacity="0.38" transform="rotate(-12,46,24)" />
        </g>
      );

    case 'long':
      return (
        <g>
          {/* Top volume */}
          <path d="M30,38 Q30,20 50,18 Q70,20 70,38 Q60,27 50,26 Q40,27 30,38 Z" fill={`url(#${gradId})`} />
          {/* Front strands framing face */}
          <path d="M30,38 Q28,48 30,58" stroke={color} strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <path d="M70,38 Q72,48 70,58" stroke={color} strokeWidth="4.5" strokeLinecap="round" fill="none" />
          {/* Highlight */}
          <ellipse cx="46" cy="24" rx="9" ry="5" fill={hi} opacity="0.35" transform="rotate(-10,46,24)" />
        </g>
      );

    case 'curly':
      return (
        <g>
          {/* Big round puff */}
          <ellipse cx="50" cy="23" rx="26" ry="21" fill={`url(#${gradId})`} />
          <ellipse cx="27" cy="38" rx="10" ry="14" fill={color} />
          <ellipse cx="73" cy="38" rx="10" ry="14" fill={color} />
          {/* Curl texture bumps */}
          {[[36,15],[50,12],[64,15],[28,30],[72,30],[40,10],[60,10]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="4" ry="3.5" fill={shadow} opacity="0.3" />
          ))}
          {/* Highlights */}
          <ellipse cx="42" cy="16" rx="7" ry="5" fill={hi} opacity="0.3" />
          <ellipse cx="60" cy="19" rx="5" ry="3.5" fill={hi} opacity="0.25" />
        </g>
      );

    case 'ponytail':
      return (
        <g>
          {/* Slicked back top */}
          <path d="M30,38 Q30,22 50,20 Q70,22 70,38 Q64,30 56,28 Q50,26 44,28 Q36,30 30,38 Z" fill={`url(#${gradId})`} />
          {/* Hair band */}
          <ellipse cx="58" cy="47" rx="3.5" ry="3" fill={shadow} />
          <ellipse cx="58" cy="47" rx="2.2" ry="1.8" fill={shadeHex('#6B7280', 20)} />
          {/* Highlight */}
          <ellipse cx="46" cy="25" rx="8" ry="4.5" fill={hi} opacity="0.32" transform="rotate(-10,46,25)" />
        </g>
      );

    case 'bun':
      return (
        <g>
          {/* Tight sides */}
          <path d="M30,38 Q30,24 50,22 Q70,24 70,38 Q65,32 58,30 Q54,29 50,29 Q46,29 42,30 Q35,32 30,38 Z" fill={`url(#${gradId})`} />
          {/* Bun */}
          <circle cx="50" cy="16" r="9.5" fill={color} />
          <circle cx="50" cy="16" r="9.5" fill={shadow} opacity="0.2" />
          <circle cx="48" cy="14" r="3.5" fill={hi} opacity="0.4" />
          {/* Bun wrap detail */}
          <path d="M42,18 Q50,12 58,18" stroke={shadow} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.6" />
          {/* Highlight on top */}
          <ellipse cx="46" cy="28" rx="7" ry="3.5" fill={hi} opacity="0.28" transform="rotate(-8,46,28)" />
        </g>
      );

    default:
      return null;
  }
}

/* ── Small star decoration ──────────────────────────────────── */
function StarDot({ cx, cy, r, color, op }: { cx: number; cy: number; r: number; color: string; op: number }) {
  const pts = Array.from({ length: 5 }, (_, i) => {
    const o = { x: cx + r * Math.sin((i * 72 * Math.PI) / 180), y: cy - r * Math.cos((i * 72 * Math.PI) / 180) };
    const inn = { x: cx + r * 0.42 * Math.sin(((i * 72 + 36) * Math.PI) / 180), y: cy - r * 0.42 * Math.cos(((i * 72 + 36) * Math.PI) / 180) };
    return `${o.x},${o.y} ${inn.x},${inn.y}`;
  }).join(' ');
  return <polygon points={pts} fill={color} opacity={op} />;
}

/* ── Color utility ──────────────────────────────────────────── */
function shadeHex(hex: string, amount: number): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  } catch { return hex; }
}
