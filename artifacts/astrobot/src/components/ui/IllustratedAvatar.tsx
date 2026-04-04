import React from 'react';
import type { AvatarConfig } from '@/components/ui/AstroAvatar';

const PRESET_IMAGE_BY_ARCHETYPE: Record<string, string> = {
  galactic: '/avatar-presets/miss-galactica/galactic-curly-brunette.png',
  cosmonaut: '/avatar-presets/cosmonautka.png',
  mage: '/avatar-presets/volshebnitsa.png',
};

const GALACTIC_STYLE_BY_HAIR_STYLE: Record<string, 'short' | 'medium' | 'long' | 'curly'> = {
  short: 'short',
  medium: 'medium',
  long: 'long',
  curly: 'curly',
};

const GALACTIC_COLOR_BY_HEX: Record<string, 'blonde' | 'brunette' | 'red'> = {
  '#f0c040': 'blonde',
  '#7b3f1e': 'brunette',
  '#c0392b': 'red',
};

function resolveGalacticVariantImage(config?: AvatarConfig | null): string {
  const normalizedHairColor = (config?.hairColor ?? '').trim().toLowerCase();
  const color = GALACTIC_COLOR_BY_HEX[normalizedHairColor] ?? 'brunette';
  const style = GALACTIC_STYLE_BY_HAIR_STYLE[config?.hairStyle ?? ''] ?? 'medium';
  return `/avatar-presets/miss-galactica/galactic-${style}-${color}.png`;
}

interface IllustratedAvatarProps {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
  imageClassName?: string;
}

export function resolveAvatarImage(config?: AvatarConfig | null): string {
  const archetype = config?.archetype ?? 'mage';
  if (archetype === 'galactic') return resolveGalacticVariantImage(config);
  return PRESET_IMAGE_BY_ARCHETYPE[archetype] ?? PRESET_IMAGE_BY_ARCHETYPE.mage;
}

export default function IllustratedAvatar({
  config,
  size = 40,
  className = '',
  imageClassName = '',
}: IllustratedAvatarProps) {
  const src = resolveAvatarImage(config);

  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt="Аватар"
        className={`w-full h-full object-cover ${imageClassName}`}
        style={{ objectPosition: 'center 24%', transform: 'scale(1.16)' }}
        loading="lazy"
      />
    </div>
  );
}
