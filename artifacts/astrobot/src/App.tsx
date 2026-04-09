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
import { getSessionId } from "@/lib/session";
import { AuthProvider } from "@/context/AuthContext";
import { AvatarSyncProvider } from "@/context/AvatarSyncContext";

const billingTestEnabled = import.meta.env.VITE_ENABLE_BILLING_TEST === "true";

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
  // Ensure session ID is initialized on mount
  useEffect(() => {
    getSessionId();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={viteBaseForRouter()}>
            <AvatarSyncProvider>
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
