import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Plus, Settings, Sparkles, Star } from 'lucide-react';
import { Link } from 'wouter';
import IllustratedAvatar from '@/components/ui/IllustratedAvatar';
import type { AvatarConfig } from '@/components/ui/AstroAvatar';

export const MENU_EASE = [0.22, 1, 0.36, 1] as const;

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
      className="relative overflow-hidden px-5 pt-5 pb-4"
    >
      <motion.div
        className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full opacity-[0.14]"
        style={{
          background: 'radial-gradient(circle, rgba(212,175,55,0.35) 0%, transparent 70%)',
        }}
        animate={{ opacity: [0.1, 0.16, 0.1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 12% 22%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 78% 18%, rgba(255,255,255,0.35), transparent), radial-gradient(1px 1px at 55% 72%, rgba(255,255,255,0.25), transparent)',
        }}
      />
      <motion.div className="pointer-events-none absolute right-8 top-10 h-14 w-14 rounded-full border border-white/[0.06]" />
      <motion.div
        className="pointer-events-none absolute right-11 top-12 h-8 w-8 rounded-full border border-[rgba(212,175,55,0.12)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
      />

      <motion.div className="relative flex items-center gap-4">
        <Link
          href={settingsHref}
          onClick={onNavigate}
          className="shrink-0 rounded-full p-[2px] ring-1 ring-[rgba(255,215,120,0.22)] shadow-[0_0_24px_rgba(212,175,55,0.12)]"
        >
          <motion.div className="h-[68px] w-[68px] overflow-hidden rounded-full bg-[#0a0a14]">
            <IllustratedAvatar config={avatarConfig} size={68} relaxedCrop />
          </motion.div>
        </Link>

        <Link
          href={settingsHref}
          onClick={onNavigate}
          className="min-w-0 flex-1 text-left group"
        >
          <p className="truncate text-[17px] font-semibold tracking-tight text-foreground/95">
            {profileName || 'Профиль'}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-foreground/45">
            {isLoggedIn ? email : 'Гостевой профиль'}
          </p>
          {!isLoggedIn && (
            <p className="mt-1.5 text-[11px] leading-snug text-foreground/35">
              Войдите — и AstroBot запомнит ваши диалоги
            </p>
          )}
        </Link>

        <motion.div className="flex shrink-0 items-center gap-0.5">
          <Link
            href={settingsHref}
            onClick={onNavigate}
            className="rounded-xl p-2.5 text-foreground/40 transition-colors hover:bg-white/[0.04] hover:text-[rgba(212,175,55,0.85)]"
            aria-label="Настройки профиля"
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Link>
          <Link
            href={settingsHref}
            onClick={onNavigate}
            className="rounded-xl p-2 text-foreground/30 transition-colors hover:bg-white/[0.04] hover:text-foreground/55"
            aria-label="Открыть профиль"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        </motion.div>
      </motion.div>
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
      className={embedded ? 'pb-0' : 'px-5 pb-2'}
    >
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-3 rounded-[20px] border border-[rgba(255,215,120,0.18)] bg-[rgba(255,215,120,0.09)] px-3.5 py-2.5 text-left transition-all duration-300 hover:border-[rgba(255,215,120,0.26)] hover:bg-[rgba(255,215,120,0.12)] active:scale-[0.99]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(255,215,120,0.14)] text-[rgba(212,175,55,0.95)] transition-shadow duration-300 group-hover:shadow-[0_0_20px_rgba(212,175,55,0.12)]">
          <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <span className="flex-1 text-[14px] font-medium tracking-tight text-[rgba(212,175,55,0.92)]">
          Новый диалог
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-[rgba(212,175,55,0.45)] transition-transform duration-300 group-hover:translate-x-0.5"
          strokeWidth={1.75}
        />
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
      className="px-5 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/50"
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
      className="group relative w-full overflow-hidden rounded-[22px] border border-[rgba(255,215,120,0.14)] bg-[rgba(255,255,255,0.02)] p-4 text-left transition-all duration-500 hover:border-[rgba(255,215,120,0.22)] hover:bg-[rgba(255,255,255,0.035)] active:scale-[0.99]"
    >
      <motion.div
        className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 70%)',
        }}
        animate={{ opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div className="relative flex items-center gap-3.5">
        <motion.div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(255,215,120,0.08)] ring-1 ring-[rgba(255,215,120,0.12)]">
          <Star className="h-5 w-5 text-[rgba(212,175,55,0.85)]" strokeWidth={1.5} fill="rgba(212,175,55,0.25)" />
          <Sparkles className="absolute -right-0.5 -top-0.5 h-3 w-3 text-[rgba(212,175,55,0.5)]" />
        </motion.div>
        <motion.div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium tracking-tight text-foreground/90">
            Хочу больше разборов
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-foreground/45">
            Подписка откроет все возможности
          </p>
        </motion.div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-foreground/25 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-[rgba(212,175,55,0.5)]"
          strokeWidth={1.75}
        />
      </motion.div>
    </motion.button>
  );
}

export function ChatMenuCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="absolute right-3 top-3 z-10 rounded-xl p-2.5 text-foreground/35 transition-colors hover:bg-white/[0.05] hover:text-foreground/60"
      aria-label="Закрыть меню"
    >
      <ChevronRight className="h-5 w-5 rotate-180" strokeWidth={1.75} />
    </button>
  );
}
