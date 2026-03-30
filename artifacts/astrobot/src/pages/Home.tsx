import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useGetMe } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';

export default function Home() {
  const [, setLocation] = useLocation();
  
  const { data: user, isLoading, error } = useGetMe({
    request: { headers: getAuthHeaders() },
    query: {
      retry: 1,
    }
  });

  useEffect(() => {
    if (!isLoading) {
      if (error || !user?.onboardingDone) {
        setLocation('/onboarding', { replace: true });
      } else {
        setLocation('/chat', { replace: true });
      }
    }
  }, [isLoading, user, error, setLocation]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/cosmic-bg.png`} 
          alt="Cosmic Background" 
          className="w-full h-full object-cover opacity-30 mix-blend-screen"
        />
      </div>
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-primary tracking-widest font-display animate-pulse uppercase text-sm">Выравниваем звёзды...</p>
      </div>
    </div>
  );
}
