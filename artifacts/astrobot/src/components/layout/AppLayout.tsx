import React from 'react';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  /** Chat: transparent shell; background painted by .chat-scene inside */
  immersive?: boolean;
}

export function AppLayout({ children, immersive = false }: AppLayoutProps) {
  return (
    // h-[100dvh] fallback; --vvh + --vv-offset-top from useVisualViewport (see App.tsx).
    <div
      className={cn(
        'relative flex h-full w-full flex-col overflow-hidden pt-safe',
        immersive
          ? 'border-x-0 bg-transparent shadow-none'
          : 'border-x border-white/[0.03] bg-background/40 shadow-lg shadow-black/30 md:border-x-0 md:shadow-none',
      )}
    >
      {!immersive && (
        <div className="pointer-events-none absolute inset-0 z-[-1] overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(140,110,255,0.16),transparent_42%),radial-gradient(circle_at_85%_90%,rgba(240,190,90,0.12),transparent_45%)]" />
        </div>
      )}
      <main className="relative z-0 flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
