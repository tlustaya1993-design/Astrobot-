import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Plus, Settings, Star } from 'lucide-react';
import { Link } from 'wouter';
import IllustratedAvatar from '@/components/ui/IllustratedAvatar';
import type { AvatarConfig } from '@/components/ui/AstroAvatar';

export const MENU_EASE = [0.22, 1, 0.36, 1] as const;

/** Warm champagne gold — avoid bronze / orange */
export const GOLD = {
  text: 'rgba(232, 220, 188, 0.92)',
  textMuted: 'rgba(232, 220, 188, 0.48)',
  border: 'rgba(240, 228, 200, 0.14)',
  borderHover: 'rgba(240, 228, 200, 0.22)',
  fill: 'rgba(240, 228, 200, 0.07)',
  fillHover: 'rgba(240, 228, 200, 0.1)',
  icon: 'rgba(240, 228, 200, 0.88)',
  glow: 'rgba(240, 228, 200, 0.06)',
} as const;

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** No `relative` here — HistoryDrawer uses `fixed`; add `relative` on the host if needed. */
export const MENU_PANEL_CLASS =
  'flex flex-col overflow-hidden border-r border-white/[0.03] bg-[#09080f] shadow-[28px_0_90px_rgba(0,0,0,0.5)]';

export function ChatMenuAtmosphere() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 110% 70% at 50% -15%, rgba(72, 58, 110, 0.07) 0%, transparent 52%)',
            'radial-gradient(ellipse 80% 55% at 105% 35%, rgba(240, 228, 200, 0.035) 0%, transparent 48%)',
            'radial-gradient(ellipse 65% 45% at -5% 75%, rgba(55, 48, 88, 0.06) 0%, transparent 42%)',
            'linear-gradient(175deg, #08070e 0%, #0a0912 38%, #0b0a14 100%)',
          ].join(', '),
        }}
      />
      <motion.div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          background:
            'radial-gradient(ellipse 50% 35% at 82% 12%, rgba(240, 228, 200, 0.04) 0%, transparent 70%)',
        }}
        animate={{ opacity: [0.4, 0.55, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 opacity-[0.028] mix-blend-overlay"
        style={{ backgroundImage: NOISE_SVG, backgroundSize: '128px 128px' }}
      />
      <motion.div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 14% 24%, rgba(255,255,255,0.35), transparent), radial-gradient(1px 1px at 72% 16%, rgba(255,255,255,0.2), transparent), radial-gradient(1px 1px at 48% 68%, rgba(255,255,255,0.15), transparent)',
        }}
      />
    </div>
  );
}

export function ChatMenuHero({
  profileName,
  email,
  isLoggedIn,
  avatarConfig,
  onNavigate,
  settingsHref = '/profile',
}: {
  profileName: string;
  email?: string | null;
  isLoggedIn: boolean;
  avatarConfig: AvatarConfig | null;
  onNavigate?: () => void;
  settingsHref?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: MENU_EASE }}
      className="relative z-[1] overflow-hidden px-5 pt-5 pb-4"
    >
      <div
        className="pointer-events-none absolute -right-4 -top-6 h-28 w-28 rounded-full opacity-[0.12]"
        style={{
          background: `radial-gradient(circle, ${GOLD.glow} 0%, transparent 72%)`,
        }}
      />

      <div className="relative flex items-center gap-4">
        <Link
          href={settingsHref}
          onClick={onNavigate}
          className="shrink-0 rounded-full p-[2px]"
          style={{
            boxShadow: `0 0 20px ${GOLD.glow}, inset 0 0 0 1px ${GOLD.border}`,
          }}
        >
          <div className="h-[68px] w-[68px] overflow-hidden rounded-full bg-[#0a0910]">
            <IllustratedAvatar config={avatarConfig} size={68} relaxedCrop />
          </div>
        </Link>

        <Link
          href={settingsHref}
          onClick={onNavigate}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[17px] font-semibold tracking-tight text-foreground/95">
            {profileName || 'Профиль'}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-foreground/42">
            {isLoggedIn ? email : 'Гостевой профиль'}
          </p>
          {!isLoggedIn && (
            <p className="mt-1.5 text-[11px] leading-snug text-foreground/32">
              Войдите — и AstroBot запомнит ваши диалоги
            </p>
          )}
        </Link>

        <Link
          href={settingsHref}
          onClick={onNavigate}
          className="shrink-0 rounded-xl p-2.5 text-foreground/38 transition-colors duration-300 hover:bg-white/[0.03] hover:text-foreground/65"
          aria-label="Настройки профиля"
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Link>
      </div>
    </motion.div>
  );
}

export function ChatMenuNewChatButton({
  onClick,
  embedded = false,
}: {
  onClick: () => void;
  embedded?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: MENU_EASE, delay: 0.05 }}
      className={`relative z-[1] ${embedded ? 'pb-0' : 'px-5 pb-2'}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="group relative w-full overflow-hidden rounded-[20px] px-3.5 py-2.5 text-left transition-all duration-300 active:scale-[0.995]"
        style={{
          border: `1px solid ${GOLD.border}`,
          background: `linear-gradient(165deg, ${GOLD.fill} 0%, rgba(255,255,255,0.02) 100%)`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.15)',
        }}
      >
        <span
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 65%)',
          }}
        />
        <span className="relative flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
            style={{
              background: 'rgba(240, 228, 200, 0.1)',
              color: GOLD.icon,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <span className="flex-1 text-[14px] font-medium tracking-tight" style={{ color: GOLD.text }}>
            Новый диалог
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
            style={{ color: GOLD.textMuted }}
            strokeWidth={1.75}
          />
        </span>
      </button>
    </motion.div>
  );
}

export function ChatMenuSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: MENU_EASE, delay: 0.08 }}
      className="relative z-[1] px-5 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/48"
    >
      {children}
    </motion.p>
  );
}

export function ChatMenuSubscriptionCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: MENU_EASE, delay: 0.12 }}
      onClick={onClick}
      className="group relative z-[1] w-full overflow-hidden rounded-[20px] px-4 py-3 text-left transition-all duration-500 active:scale-[0.995]"
      style={{
        border: `1px solid ${GOLD.border}`,
        background: [
          'radial-gradient(ellipse 90% 80% at 50% -20%, rgba(240, 228, 200, 0.09) 0%, transparent 55%)',
          'linear-gradient(168deg, rgba(240, 228, 200, 0.06) 0%, rgba(255,255,255,0.02) 38%, rgba(12,10,18,0.65) 100%)',
        ].join(', '),
        boxShadow:
          'inset 0 1px 0 rgba(240,228,200,0.12), inset 0 -8px 20px rgba(0,0,0,0.1), 0 2px 14px rgba(0,0,0,0.2)',
      }}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 0% 0%, ${GOLD.glow} 0%, transparent 55%)`,
        }}
      />
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(240,228,200,0.2), transparent)',
        }}
      />
      <motion.span
        className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full"
        style={{
          background: `radial-gradient(circle, ${GOLD.glow} 0%, transparent 70%)`,
        }}
        animate={{ opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="relative flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px]"
          style={{
            background:
              'linear-gradient(145deg, rgba(240,228,200,0.14) 0%, rgba(240,228,200,0.04) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <Star className="h-[15px] w-[15px]" style={{ color: GOLD.icon }} strokeWidth={1.4} fill="rgba(240,228,200,0.2)" />
        </span>
        <span className="min-w-0 flex-1 py-0">
          <p className="text-[13px] font-medium tracking-tight" style={{ color: GOLD.text }}>
            Хочу больше разборов
          </p>
          <p className="mt-0.5 text-[10px] font-normal leading-snug" style={{ color: GOLD.textMuted }}>
            Подписка откроет все возможности
          </p>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 transition-all duration-300 group-hover:translate-x-0.5"
          style={{ color: GOLD.textMuted }}
          strokeWidth={1.75}
        />
      </span>
    </motion.button>
  );
}

export function ChatMenuCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute right-3 top-3 z-20 rounded-xl p-2.5 text-foreground/35 transition-colors hover:bg-white/[0.04] hover:text-foreground/58"
      aria-label="Закрыть меню"
    >
      <ChevronRight className="h-5 w-5 rotate-180" strokeWidth={1.75} />
    </button>
  );
}

/** Layered tactile surface for conversation rows */
export function conversationRowSurfaceStyle(active: boolean): React.CSSProperties {
  if (active) {
    return {
      background:
        'linear-gradient(168deg, rgba(240,228,200,0.09) 0%, rgba(240,228,200,0.04) 50%, rgba(255,255,255,0.02) 100%)',
      boxShadow:
        'inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(240,228,200,0.1), 0 1px 3px rgba(0,0,0,0.12)',
    };
  }
  return {
    background:
      'linear-gradient(168deg, rgba(255,255,255,0.038) 0%, rgba(255,255,255,0.014) 45%, rgba(8,7,14,0.4) 100%)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.045), inset 0 0 0 1px rgba(255,255,255,0.025), 0 1px 2px rgba(0,0,0,0.18)',
  };
}
