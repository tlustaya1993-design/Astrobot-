import React, { useEffect, useState } from 'react';
import type { AvatarConfig } from '@/components/ui/AstroAvatar';
import { cn } from '@/lib/utils';

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

/** Должно совпадать с `--canvas` / `--target-r` в scripts/normalize_avatar_circles.py */
const NORMALIZED_PRESET_CANVAS = 1024;
const NORMALIZED_PRESET_CIRCLE_R = 470;

/**
 * После normalize_avatar_circles.py: круг r=470 в квадрате 1024 (mage PNG, miss-galactica WebP).
 * Базовый zoom + overscan, чтобы не торчали прямые кромки файла внутри круглого клипа.
 */
const NORMALIZED_CIRCLE_BASE_SCALE = (NORMALIZED_PRESET_CANVAS / 2) / NORMALIZED_PRESET_CIRCLE_R;
/** Подстройка 1.1–1.25 при необходимости. */
const NORMALIZED_CLIP_OVERSCAN = 1.18;
const NORMALIZED_PRESET_FILL_SCALE = NORMALIZED_CIRCLE_BASE_SCALE * NORMALIZED_CLIP_OVERSCAN;

export function getAvatarCropStyle(archetype?: string | null): { objectPosition: string; scale: number } {
  switch (archetype) {
    case 'mage':
    case 'galactic':
      return { objectPosition: '50% 50%', scale: NORMALIZED_PRESET_FILL_SCALE };
    case 'cosmonaut':
      return { objectPosition: '50% 36%', scale: 1.14 };
    default:
      return { objectPosition: '50% 38%', scale: 1.1 };
  }
}

export function fallbackAvatarSrc(archetype?: string | null): string {
  if (archetype === 'galactic') return '/avatar-presets/miss-galactica/galactic-medium-brunette.webp';
  if (archetype === 'mage') return '/avatar-presets/mage/mage-medium-brunette.png';
  return '/avatar-presets/cosmonautka.png';
}

export function resolveAvatarImage(config?: AvatarConfig | null): string {
  const archetype = config?.archetype ?? 'mage';
  if (archetype === 'galactic') return resolveGalacticVariantImage(config);
  if (archetype === 'mage') return resolveMageVariantImage(config);
  return PRESET_IMAGE_BY_ARCHETYPE[archetype] ?? '/avatar-presets/cosmonautka.png';
}

/** Полноразмерное фото в круге: crop + запасной файл при ошибке загрузки. */
export function AvatarPortraitImage({
  config,
  className = '',
  imageClassName = '',
  loading = 'lazy',
  cropOverride,
}: {
  config?: AvatarConfig | null;
  className?: string;
  imageClassName?: string;
  loading?: 'lazy' | 'eager';
  cropOverride?: { objectPosition: string; scale: number };
}) {
  const archetype = config?.archetype ?? 'mage';
  const primary = resolveAvatarImage(config);
  const [src, setSrc] = useState(primary);
  const crop = cropOverride ?? getAvatarCropStyle(archetype);
  const fallback = fallbackAvatarSrc(archetype);

  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  const onRasterError = () => {
    if (src !== fallback) setSrc(fallback);
  };

  return (
    <img
      src={src}
      alt="Аватар"
      className={cn('block', className, imageClassName)}
      loading={loading}
      style={{
        objectPosition: crop.objectPosition,
        transform: `scale(${crop.scale})`,
        transformOrigin: 'center center',
      }}
      onError={onRasterError}
    />
  );
}

interface IllustratedAvatarProps {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
  imageClassName?: string;
  /** Меньше zoom — для крупного круга в профиле, чтобы голова не обрезалась */
  relaxedCrop?: boolean;
}

export default function IllustratedAvatar({
  config,
  size = 40,
  className = '',
  imageClassName = '',
  relaxedCrop = false,
}: IllustratedAvatarProps) {
  const archetype = config?.archetype ?? 'mage';
  const baseCrop = getAvatarCropStyle(archetype);
  const crop = relaxedCrop
    ? {
        objectPosition: archetype === 'cosmonaut' ? '50% 40%' : baseCrop.objectPosition,
        scale: Math.max(baseCrop.scale, archetype === 'cosmonaut' ? 1.08 : 1.16),
      }
    : baseCrop;

  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <AvatarPortraitImage
        config={config}
        className="h-full w-full object-cover"
        imageClassName={imageClassName}
        loading="lazy"
        cropOverride={crop}
      />
    </div>
  );
}
