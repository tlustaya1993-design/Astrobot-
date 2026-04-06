import IllustratedAvatar from '@/components/ui/IllustratedAvatar';
import { DEFAULT_AVATAR, type AvatarConfig } from '@/components/ui/AstroAvatar';
import type { OpenaiConversationContactAvatarConfig } from '@workspace/api-client-react';

const CONTACT_COLORS = [
  'from-violet-500 to-purple-700',
  'from-rose-500 to-pink-700',
  'from-sky-500 to-blue-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-700',
];

function contactColorClass(contactId: number) {
  return CONTACT_COLORS[Math.abs(contactId) % CONTACT_COLORS.length];
}

function initials(name: string | null | undefined) {
  const t = (name || '').trim();
  if (!t) return '?';
  return t
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function toAvatarConfig(
  raw: OpenaiConversationContactAvatarConfig | null | undefined,
): AvatarConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  return { ...DEFAULT_AVATAR, ...raw };
}

type Props = {
  userConfig: AvatarConfig;
  contactAvatarConfig?: OpenaiConversationContactAvatarConfig | null;
  contactId: number;
  contactName?: string | null;
  /** Диаметр каждого круга в px */
  size?: number;
  /** Класс кольца вокруг кружков (под фон сайдбара / шторки) */
  ringClassName?: string;
  className?: string;
};

/**
 * Два пересекающихся круга: профиль пользователя + контакт (синастрия).
 * У контакта без сохранённого аватара — градиент с и.initials.
 */
export function SynastryRowAvatars({
  userConfig,
  contactAvatarConfig,
  contactId,
  contactName,
  size = 26,
  ringClassName = 'ring-card',
  className = '',
}: Props) {
  const contactCfg = toAvatarConfig(contactAvatarConfig ?? undefined);
  const gap = Math.max(6, Math.round(size * 0.35));
  const w = size + gap;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: w, height: size }}
      title={
        contactName
          ? `Диалог с ${contactName}`
          : 'Диалог в режиме синастрии'
      }
    >
      <div
        className={`absolute left-0 top-0 rounded-full overflow-hidden border-2 z-0 ${ringClassName}`}
        style={{ width: size, height: size }}
      >
        <IllustratedAvatar config={userConfig} size={size} relaxedCrop />
      </div>
      {contactCfg ? (
        <div
          className={`absolute top-0 rounded-full overflow-hidden border-2 z-10 ${ringClassName}`}
          style={{ width: size, height: size, left: gap }}
        >
          <IllustratedAvatar config={contactCfg} size={size} relaxedCrop />
        </div>
      ) : (
        <div
          className={`absolute top-0 rounded-full border-2 z-10 flex items-center justify-center bg-gradient-to-br ${contactColorClass(contactId)} ${ringClassName}`}
          style={{ width: size, height: size, left: gap }}
        >
          <span
            className="font-bold text-white leading-none"
            style={{ fontSize: Math.max(8, Math.round(size * 0.31)) }}
          >
            {initials(contactName)}
          </span>
        </div>
      )}
    </div>
  );
}
