import React from 'react';
import type { AvatarConfig } from '@/components/ui/AstroAvatar';

const PRESET_IMAGE_BY_ARCHETYPE: Record<string, string> = {
  galactic: '/avatar-presets/miss-galactica.png',
  cosmonaut: '/avatar-presets/cosmonautka.png',
  mage: '/avatar-presets/volshebnitsa.png',
};

interface IllustratedAvatarProps {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
  imageClassName?: string;
}

function resolveAvatarImage(config?: AvatarConfig | null): string {
  const archetype = config?.archetype ?? 'mage';
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
        style={{ objectPosition: 'center 28%', transform: 'scale(1.08)' }}
        loading="lazy"
      />
    </div>
  );
}
