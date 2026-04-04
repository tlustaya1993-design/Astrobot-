import React, { useEffect, useState } from 'react';
import type { AvatarConfig } from '@/components/ui/AstroAvatar';

const PRESET_IMAGE_BY_ARCHETYPE: Record<string, string> = {
  galactic: '/avatar-presets/miss-galactica/galactic-curly-brunette.webp',
  cosmonaut: '/avatar-presets/cosmonautka.png',
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
  return `/avatar-presets/miss-galactica/galactic-${style}-${color}.webp`;
}

function resolveMageVariantImage(config?: AvatarConfig | null): string {
  const normalizedHairColor = (config?.hairColor ?? '').trim().toLowerCase();
  const color = GALACTIC_COLOR_BY_HEX[normalizedHairColor] ?? 'brunette';
  const style = GALACTIC_STYLE_BY_HAIR_STYLE[config?.hairStyle ?? ''] ?? 'medium';
  return `/avatar-presets/mage/mage-${style}-${color}.png`;
}

/** Кадрирование круга под разные арты (лицо ближе к центру, без обрезания макушки). */
export function getAvatarCropStyle(archetype?: string | null): { objectPosition: string; scale: number } {
  switch (archetype) {
    case 'galactic':
      return { objectPosition: '50% 28%', scale: 1.22 };
    case 'mage':
      return { objectPosition: '50% 43%', scale: 1.16 };
    case 'cosmonaut':
      return { objectPosition: '50% 36%', scale: 1.14 };
    default:
      return { objectPosition: '50% 38%', scale: 1.1 };
  }
}

export function fallbackAvatarSrc(archetype?: string | null): string {
  if (archetype === 'galactic') return '/avatar-presets/miss-galactica/galactic-medium-brunette.webp';
  if (archetype === 'mage') return '/avatar-presets/volshebnitsa.png';
  return '/avatar-presets/cosmonautka.png';
}

export function resolveAvatarImage(config?: AvatarConfig | null): string {
  const archetype = config?.archetype ?? 'mage';
  if (archetype === 'galactic') return resolveGalacticVariantImage(config);
  if (archetype === 'mage') return resolveMageVariantImage(config);
  return PRESET_IMAGE_BY_ARCHETYPE[archetype] ?? '/avatar-presets/cosmonautka.png';
}

/** Полноразмерное фото в круге: правильный crop + запасной файл, если варианта ещё нет в /mage/. */
export function AvatarPortraitImage({
  config,
  className = '',
  loading = 'lazy',
}: {
  config?: AvatarConfig | null;
  className?: string;
  loading?: 'lazy' | 'eager';
}) {
  const archetype = config?.archetype ?? 'mage';
  const primary = resolveAvatarImage(config);
  const [src, setSrc] = useState(primary);
  const crop = getAvatarCropStyle(archetype);
  const fallback = fallbackAvatarSrc(archetype);

  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  return (
    <img
      src={src}
      alt="Аватар"
      className={['block', className].filter(Boolean).join(' ')}
      loading={loading}
      style={{
        objectPosition: crop.objectPosition,
        transform: `scale(${crop.scale})`,
        transformOrigin: 'center center',
      }}
      onError={() => {
        if (src !== fallback) setSrc(fallback);
      }}
    />
  );
}

interface IllustratedAvatarProps {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
  imageClassName?: string;
}

export default function IllustratedAvatar({
  config,
  size = 40,
  className = '',
  imageClassName = '',
}: IllustratedAvatarProps) {
  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <AvatarPortraitImage
        config={config}
        className={`w-full h-full object-cover ${imageClassName}`}
        loading="lazy"
      />
    </div>
  );
}
