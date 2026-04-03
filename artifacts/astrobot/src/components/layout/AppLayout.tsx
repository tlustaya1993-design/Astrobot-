import React from 'react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background/50 relative overflow-hidden shadow-2xl shadow-black/50 border-x border-white/5 pt-safe md:border-x-0 md:shadow-none">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(140,110,255,0.16),transparent_42%),radial-gradient(circle_at_85%_90%,rgba(240,190,90,0.12),transparent_45%)]" />
      </div>
      <main className="flex-1 flex flex-col relative z-0 min-h-0">
        {children}
      </main>
    </div>
  );
}
