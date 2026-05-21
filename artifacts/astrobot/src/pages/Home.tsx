import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, useGetMe } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { Button } from '@/components/ui/button';

const BOOT_TIMEOUT_MS = 12_000;

export default function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [bootTimedOut, setBootTimedOut] = useState(false);

  const { data: user, isLoading, isFetching, error, refetch } = useGetMe({
    request: { headers: getAuthHeaders() },
    query: {
      retry: 1,
      staleTime: 0,
    },
  });

  useEffect(() => {
    const t = window.setTimeout(() => setBootTimedOut(true), BOOT_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, []);

  const bootFailed = Boolean(error) || (bootTimedOut && !user && !isFetching);
  const bootReady = !isLoading && !isFetching;

  useEffect(() => {
    if (bootFailed || !bootReady) return;

    if (user?.onboardingDone) {
      setLocation('/chat', { replace: true });
    } else {
      setLocation('/onboarding', { replace: true });
    }
  }, [bootFailed, bootReady, user, setLocation]);

  const handleRetry = () => {
    setBootTimedOut(false);
    void queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    void refetch();
    window.setTimeout(() => setBootTimedOut(true), BOOT_TIMEOUT_MS);
  };

  if (bootFailed) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden px-6">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_20%_10%,rgba(131,58,180,0.22),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(255,196,74,0.12),transparent_40%)]" />
        <div className="relative z-10 flex flex-col items-center text-center max-w-sm gap-4">
          <p className="text-primary tracking-widest font-display uppercase text-sm">
            Сервер не отвечает
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Не удалось загрузить профиль. Обычно это временная проблема с базой данных на сервере.
          </p>
          <Button type="button" className="min-w-[10rem]" onClick={handleRetry}>
            Повторить
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => window.location.reload()}
          >
            Обновить страницу
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_20%_10%,rgba(131,58,180,0.22),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(255,196,74,0.12),transparent_40%)]" />
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-primary tracking-widest font-display animate-pulse uppercase text-sm">Выравниваем звёзды...</p>
      </div>
    </div>
  );
}
