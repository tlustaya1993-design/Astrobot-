import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

/** Кадрирование для растров без вписанного «золотого» круга (object-fit + scale). */
export function getAvatarCropStyle(archetype?: string | null): { objectPosition: string; scale: number } {
  switch (archetype) {
    case 'galactic':
      return { objectPosition: '50% 28%', scale: 1.22 };
    case 'cosmonaut':
      return { objectPosition: '50% 36%', scale: 1.14 };
    default:
      return { objectPosition: '50% 38%', scale: 1.1 };
  }
}

/**
 * Геометрия внутреннего круга (золотая рамка) в координатах исходника.
 * Почти все mage — 1024×682; квадратный кадр (например short-blonde) — отдельный коэффициент r.
 */
function getMageCircleInImagePixels(iw: number, ih: number): { cx: number; cy: number; r: number } {
  const minSide = Math.min(iw, ih);
  const maxSide = Math.max(iw, ih);
  const nearlySquare = maxSide / minSide < 1.06;
  const r = minSide * (nearlySquare ? 0.39 : 0.468);
  return { cx: iw * 0.5, cy: ih * 0.5, r };
}

function computeMageCircleLayout(
  containerSize: number,
  iw: number,
  ih: number,
): { w: number; h: number; left: number; top: number } {
  if (containerSize <= 0 || iw <= 0 || ih <= 0) {
    return { w: 0, h: 0, left: 0, top: 0 };
  }
  const { cx, cy, r } = getMageCircleInImagePixels(iw, ih);
  const k = containerSize / 2 / r;
  return {
    w: iw * k,
    h: ih * k,
    left: containerSize / 2 - cx * k,
    top: containerSize / 2 - cy * k,
  };
}

/** Вписывает нарисованный в PNG круг в круг контейнера (касание по окружности). */
function MageCircleFitImage({
  src,
  alt,
  className = '',
  imageClassName = '',
  loading = 'lazy',
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  loading?: 'lazy' | 'eager';
  onError?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(0);
  const [intrinsic, setIntrinsic] = useState<{ iw: number; ih: number } | null>(null);

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    setBox(el.getBoundingClientRect().width);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const layout = useMemo(() => {
    if (!intrinsic || box <= 0) return null;
    return computeMageCircleLayout(box, intrinsic.iw, intrinsic.ih);
  }, [intrinsic, box]);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setIntrinsic({ iw: img.naturalWidth, ih: img.naturalHeight });
  }, []);

  useEffect(() => {
    setIntrinsic(null);
  }, [src]);

  const imgStyle: React.CSSProperties = layout
    ? {
        position: 'absolute',
        width: layout.w,
        height: layout.h,
        left: layout.left,
        top: layout.top,
        maxWidth: 'none',
        opacity: 1,
      }
    : {
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        opacity: 0,
      };

  return (
    <div ref={wrapRef} className={cn('relative h-full w-full overflow-hidden', className)}>
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={onImgLoad}
        onError={onError}
        className={cn('block', imageClassName)}
        style={imgStyle}
        draggable={false}
      />
    </div>
  );
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
  imageClassName = '',
  loading = 'lazy',
}: {
  config?: AvatarConfig | null;
  className?: string;
  /** Доп. классы только для тега img (для mage — к img внутри circle-fit). */
  imageClassName?: string;
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

  const onRasterError = () => {
    if (src !== fallback) setSrc(fallback);
  };

  if (archetype === 'mage') {
    return (
      <MageCircleFitImage
        src={src}
        alt="Аватар"
        className={className}
        imageClassName={imageClassName}
        loading={loading}
        onError={onRasterError}
      />
    );
  }

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
        className="h-full w-full"
        imageClassName={`object-cover ${imageClassName}`.trim()}
        loading="lazy"
      />
    </div>
  );
}
