import React, { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Onboarding from "@/pages/Onboarding";
import Chat from "@/pages/Chat";
import History from "@/pages/History";
import ProfilePage from "@/pages/ProfilePage";
import AuthCallback from "@/pages/AuthCallback";
import BillingTestPage from "@/pages/BillingTestPage";
import AdminPage from "@/pages/AdminPage";
import { getSessionId, getAuthHeaders } from "@/lib/session";
import { recordSessionStart } from "@/lib/pwa-hints";
import { AuthProvider } from "@/context/AuthContext";
import { AvatarSyncProvider } from "@/context/AvatarSyncContext";
import { toast } from "@/hooks/use-toast";

const billingTestEnabled = import.meta.env.VITE_ENABLE_BILLING_TEST === "true";

const RECONCILE_SESSION_KEY = 'ab_rec_v1';

/** Тихая проверка незачисленных платежей при старте приложения.
 *  Срабатывает один раз за браузерную сессию. */
function SilentReconcile() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(RECONCILE_SESSION_KEY) === '1') return;
      sessionStorage.setItem(RECONCILE_SESSION_KEY, '1');
    } catch {
      return;
    }
    fetch('/api/billing/payments/reconcile', {
      method: 'POST',
      headers: getAuthHeaders(),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { applied?: number } | null) => {
        if (data?.applied && data.applied > 0) {
          toast({
            title: 'Баланс пополнен',
            description: `Зачислено ${data.applied} запросов.`,
          });
        }
      })
      .catch(() => {});
  }, []);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    }
  }
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/chat" component={Chat} />
      <Route path="/chat/:id" component={Chat} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/history" component={History} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/auth/callback" component={AuthCallback} />
      {billingTestEnabled ? (
        <Route path="/billing/test" component={BillingTestPage} />
      ) : null}
      <Route component={NotFound} />
    </Switch>
  );
}

/** Wouter: base не должен быть "" — при BASE_URL "/" после trim получалась пустая строка и ломался рендер. */
function viteBaseForRouter(): string {
  const b = import.meta.env.BASE_URL;
  if (b === "/" || b === "") return "/";
  return b.endsWith("/") ? b.slice(0, -1) : b;
}

function App() {
  useEffect(() => {
    // Strip ?test=true from URL after session.ts has already read and stored it
    const params = new URLSearchParams(window.location.search);
    if (params.get('test') === 'true') {
      params.delete('test');
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState(null, '', newUrl);
    }
    getSessionId();
    recordSessionStart();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={viteBaseForRouter()}>
            <AvatarSyncProvider>
              <SilentReconcile />
              <Router />
            </AvatarSyncProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
