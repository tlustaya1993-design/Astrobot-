import React, { useId } from 'react';

export const HAIR_COLORS = [
  { id: 'black',  label: 'Чёрный',      hex: '#1c1c2e' },
  { id: 'brown',  label: 'Каштановый',  hex: '#7B3F1E' },
  { id: 'blonde', label: 'Светлый',     hex: '#F0C040' },
  { id: 'red',    label: 'Рыжий',       hex: '#C0392B' },
  { id: 'silver', label: 'Серебряный',  hex: '#A0AABB' },
  { id: 'violet', label: 'Лиловый',     hex: '#8B5CF6' },
];

export const ROBE_COLORS = [
  { id: 'indigo',  label: 'Индиго',    hex: '#3730A3' },
  { id: 'violet',  label: 'Фиолетовый', hex: '#6D28D9' },
  { id: 'navy',    label: 'Ночной',    hex: '#1E3A5F' },
  { id: 'forest',  label: 'Лесной',    hex: '#166534' },
  { id: 'crimson', label: 'Пурпурный', hex: '#9B1C1C' },
  { id: 'teal',    label: 'Бирюзовый', hex: '#0F766E' },
];

export const EYE_COLORS = [
  { id: 'brown',  label: 'Карие',      hex: '#7B4F2E' },
  { id: 'blue',   label: 'Голубые',    hex: '#3B82F6' },
  { id: 'green',  label: 'Зелёные',    hex: '#16A34A' },
  { id: 'amber',  label: 'Янтарные',   hex: '#D97706' },
  { id: 'violet', label: 'Сиреневые',  hex: '#7C3AED' },
  { id: 'gray',   label: 'Серые',      hex: '#6B7280' },
];

export interface AvatarConfig {
  hairColor: string;
  robeColor: string;
  eyeColor: string;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  hairColor: HAIR_COLORS[0].hex,
  robeColor: ROBE_COLORS[0].hex,
  eyeColor: EYE_COLORS[1].hex,
};

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
}

export default function AstroAvatar({ config = DEFAULT_AVATAR, size = 80, className = '' }: Props) {
  const uid = useId().replace(/:/g, '');
  const clipId = `av-clip-${uid}`;
  const gradId = `av-grad-${uid}`;

  const skin = '#F3C99F';
  const skinDark = '#D9A87A';
  const { hairColor, robeColor, eyeColor } = config;

  const robeDark = shadeHex(robeColor, -30);
  const robeLight = shadeHex(robeColor, 40);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <radialGradient id={gradId} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={shadeHex(robeColor, 20)} stopOpacity="0.4" />
          <stop offset="100%" stopColor="#080812" />
        </radialGradient>
      </defs>

      <g clipPath={`url(#${clipId})`}>
        {/* Background */}
        <circle cx="50" cy="50" r="50" fill={`url(#${gradId})`} />
        <circle cx="50" cy="50" r="50" fill="#0b0b18" />

        {/* Stars background */}
        {[[15,20],[80,15],[25,70],[88,60],[60,8]].map(([x,y],i) => (
          <circle key={i} cx={x} cy={y} r="0.8" fill="rgba(255,255,255,0.5)" />
        ))}

        {/* Robe / shoulders */}
        <path d="M-10,125 L18,72 Q30,66 50,64 Q70,66 82,72 L110,125 Z" fill={robeColor} />
        <path d="M18,72 Q30,66 50,64 Q70,66 82,72 L76,125 L24,125 Z" fill={robeDark} />

        {/* Robe shine */}
        <path d="M24,80 Q28,75 35,78" stroke={robeLight} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5" />

        {/* Stars on robe */}
        <StarShape cx={32} cy={90} r={3} fill="rgba(255,215,0,0.6)" />
        <StarShape cx={68} cy={84} r={2.2} fill="rgba(255,215,0,0.5)" />
        <circle cx="50" cy="100" r="1.5" fill="rgba(255,215,0,0.5)" />

        {/* Robe collar / V-neck */}
        <path d="M44,65 L50,74 L56,65 Q53,62 50,62 Q47,62 44,65 Z" fill={robeDark} />

        {/* Neck */}
        <rect x="44" y="57" width="12" height="12" rx="4" fill={skin} />
        <rect x="44" y="62" width="12" height="7" rx="2" fill={skinDark} opacity="0.3" />

        {/* Head */}
        <ellipse cx="50" cy="41" rx="21" ry="22" fill={skin} />

        {/* Hair back layer */}
        <ellipse cx="50" cy="25" rx="23" ry="17" fill={hairColor} />

        {/* Ears */}
        <ellipse cx="29" cy="41" rx="4" ry="5.5" fill={skin} />
        <ellipse cx="71" cy="41" rx="4" ry="5.5" fill={skin} />
        <ellipse cx="29" cy="41" rx="2.5" ry="3.5" fill={skinDark} opacity="0.5" />
        <ellipse cx="71" cy="41" rx="2.5" ry="3.5" fill={skinDark} opacity="0.5" />

        {/* Head (on top of ears & hair) */}
        <ellipse cx="50" cy="43" rx="19" ry="20" fill={skin} />

        {/* Bangs / front hair */}
        <path
          d="M31,29 Q33,16 50,15 Q67,16 69,29 Q61,22 56,24 Q53,18 50,18 Q47,18 44,24 Q39,22 31,29"
          fill={hairColor}
        />
        {/* Side hair left */}
        <path d="M31,29 Q27,36 29,44 Q26,39 29,32 Z" fill={hairColor} />
        {/* Side hair right */}
        <path d="M69,29 Q73,36 71,44 Q74,39 71,32 Z" fill={hairColor} />

        {/* Eyebrows */}
        <path d="M35,32 Q41,29 47,32" stroke={hairColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M53,32 Q59,29 65,32" stroke={hairColor} strokeWidth="1.8" strokeLinecap="round" fill="none" />

        {/* Eyes — left */}
        <ellipse cx="41" cy="39" rx="6.5" ry="7" fill="white" />
        <ellipse cx="41" cy="40" rx="4.5" ry="5.5" fill={eyeColor} />
        <circle cx="41" cy="40" r="2.8" fill="#0a0a14" />
        <circle cx="39.2" cy="38.2" r="1.4" fill="white" />
        {/* Eyelid top */}
        <path d="M34.5,33.5 Q41,31 47.5,33.5" stroke="#1a1a2e" strokeWidth="1.4" fill="none" strokeLinecap="round" />

        {/* Eyes — right */}
        <ellipse cx="59" cy="39" rx="6.5" ry="7" fill="white" />
        <ellipse cx="59" cy="40" rx="4.5" ry="5.5" fill={eyeColor} />
        <circle cx="59" cy="40" r="2.8" fill="#0a0a14" />
        <circle cx="57.2" cy="38.2" r="1.4" fill="white" />
        <path d="M52.5,33.5 Q59,31 65.5,33.5" stroke="#1a1a2e" strokeWidth="1.4" fill="none" strokeLinecap="round" />

        {/* Blush cheeks */}
        <circle cx="35" cy="47" r="5.5" fill="rgba(255,130,130,0.28)" />
        <circle cx="65" cy="47" r="5.5" fill="rgba(255,130,130,0.28)" />

        {/* Nose */}
        <path d="M47.5,48 Q50,51.5 52.5,48" stroke={skinDark} strokeWidth="1.3" fill="none" strokeLinecap="round" />

        {/* Mouth */}
        <path d="M43,55 Q50,60 57,55" stroke={skinDark} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function StarShape({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const pts = Array.from({ length: 5 }, (_, i) => {
    const outer = { x: cx + r * Math.sin((i * 72 * Math.PI) / 180), y: cy - r * Math.cos((i * 72 * Math.PI) / 180) };
    const inner = { x: cx + (r * 0.4) * Math.sin(((i * 72 + 36) * Math.PI) / 180), y: cy - (r * 0.4) * Math.cos(((i * 72 + 36) * Math.PI) / 180) };
    return `${outer.x},${outer.y} ${inner.x},${inner.y}`;
  }).join(' ');
  return <polygon points={pts} fill={fill} />;
}

function shadeHex(hex: string, amount: number): string {
  try {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  } catch {
    return hex;
  }
}
