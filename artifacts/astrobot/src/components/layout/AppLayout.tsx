import React from 'react';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto bg-background/50 relative overflow-hidden shadow-2xl shadow-black/50 border-x border-white/5 pt-safe">
      <div className="absolute inset-0 z-[-1] pointer-events-none overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <img
          src={`${import.meta.env.BASE_URL}images/cosmic-bg.png`}
          alt="Фон"
          className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen"
        />
      </div>
      <main className="flex-1 flex flex-col relative z-0 min-h-0">
        {children}
      </main>
    </div>
  );
}
