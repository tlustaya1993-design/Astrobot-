import React from 'react';
import { Link, useLocation } from 'wouter';
import { MessageSquare, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

export function AppLayout({ children, hideNav = false }: { children: React.ReactNode, hideNav?: boolean }) {
  const [location] = useLocation();

  return (
    <div className="flex flex-col min-h-[100dvh] max-w-2xl mx-auto bg-background/50 relative overflow-hidden shadow-2xl shadow-black/50 border-x border-white/5 pt-safe">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <img
          src={`${import.meta.env.BASE_URL}images/cosmic-bg.png`}
          alt="Фон"
          className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen"
        />
      </div>

      <main className="flex-1 flex flex-col relative z-0 pb-[80px]">
        {children}
      </main>

      {!hideNav && (
        <div className="fixed bottom-0 inset-x-0 z-50 flex justify-center pb-safe">
          <div className="w-full max-w-2xl bg-card/80 backdrop-blur-xl border-t border-border px-6 py-3 flex items-center justify-around">
            <Link
              href="/chat"
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl transition-colors duration-300",
                location === '/chat' || location.startsWith('/chat/') ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageSquare className="w-6 h-6" />
              <span className="text-[10px] font-medium tracking-wide">Чат</span>
            </Link>

            <Link
              href="/history"
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl transition-colors duration-300",
                location === '/history' ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="w-6 h-6" />
              <span className="text-[10px] font-medium tracking-wide">История</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
