import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/lib/session";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

type AdminMetrics = {
  totalUsers: number;
  dau: number;
  wau: number;
  dauShare: number;
  wauShare: number;
};

type AdminUser = {
  id: number;
  email: string | null;
  sessionId: string;
  requestsUsed: number;
  requestsBalance: number;
  freeRemaining: number;
  isUnlimited: boolean;
  remaining: number;
  updatedAt: string;
};

type AdminPayment = {
  id: number;
  createdAt: string;
  packageCode: string;
  creditsGranted: number;
  status: string;
  creditsAppliedAt: string | null;
  refundedAt: string | null;
  providerPaymentId: string;
};

export default function AdminPage() {
  const { email, isLoggedIn } = useAuth();
  const [queryEmail, setQueryEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const canSearch = useMemo(() => queryEmail.trim().length > 4, [queryEmail]);

  const fetchMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch("/api/admin/metrics", { headers: getAuthHeaders() });
      const payload = (await res.json()) as { ok?: boolean; error?: string } & Partial<AdminMetrics>;
      if (!res.ok || !payload.ok) throw new Error(payload.error || `Ошибка (${res.status})`);
      setMetrics({
        totalUsers: payload.totalUsers ?? 0,
        dau: payload.dau ?? 0,
        wau: payload.wau ?? 0,
        dauShare: payload.dauShare ?? 0,
        wauShare: payload.wauShare ?? 0,
      });
    } catch {
      // metrics are best-effort, skip toast noise
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) fetchMetrics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const fetchUser = async () => {
    if (!canSearch) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?email=${encodeURIComponent(queryEmail.trim())}`, {
        headers: getAuthHeaders(),
      });
      const payload = (await res.json()) as {
        error?: string;
        user?: AdminUser;
        payments?: AdminPayment[];
      };
      if (!res.ok || !payload.user) {
        throw new Error(payload.error || `Ошибка (${res.status})`);
      }
      setUser(payload.user);
      setPayments(payload.payments ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось загрузить пользователя";
      toast({ title: "Ошибка", description: message });
      setUser(null);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const grant = async (credits: number) => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users/grant-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ email: user.email, credits }),
      });
      const payload = (await res.json()) as { error?: string; granted?: number };
      if (!res.ok) {
        throw new Error(payload.error || `Ошибка (${res.status})`);
      }
      toast({
        title: "Готово",
        description: `Начислено ${payload.granted ?? credits} запросов`,
      });
      await fetchUser();
    } catch (err) {
      toast({
        title: "Ошибка начисления",
        description: err instanceof Error ? err.message : "Не удалось начислить запросы",
      });
    } finally {
      setLoading(false);
    }
  };

  const refund = async (providerPaymentId: string) => {
    if (!confirm('Вернуть деньги за этот платёж? Действие нельзя отменить.')) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/payments/refund", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ providerPaymentId }),
      });
      const payload = (await res.json()) as { error?: string; refundId?: string };
      if (!res.ok) {
        throw new Error(payload.error || `Ошибка (${res.status})`);
      }
      toast({
        title: "Возврат выполнен",
        description: `Деньги возвращены, запросы списаны. ID возврата: ${payload.refundId}`,
      });
      await fetchUser();
    } catch (err) {
      toast({
        title: "Ошибка возврата",
        description: err instanceof Error ? err.message : "Не удалось выполнить возврат",
      });
    } finally {
      setLoading(false);
    }
  };

  const reconcile = async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users/reconcile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ email: user.email }),
      });
      const payload = (await res.json()) as { error?: string; applied?: number };
      if (!res.ok) {
        throw new Error(payload.error || `Ошибка (${res.status})`);
      }
      toast({
        title: "Reconcile выполнен",
        description: payload.applied
          ? `Доначислено: +${payload.applied}`
          : "Начислять было нечего",
      });
      await fetchUser();
    } catch (err) {
      toast({
        title: "Ошибка reconcile",
        description: err instanceof Error ? err.message : "Не удалось выполнить reconcile",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-3xl mx-auto w-full">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Админка</h1>
          <Link href="/chat" className="text-sm text-primary underline underline-offset-2">
            Вернуться в чат
          </Link>
        </div>

        {!isLoggedIn ? (
          <div className="rounded-xl border border-border bg-card p-4 text-sm">
            Нужно войти в аккаунт администратора.
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Пользователи</p>
          {metricsLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : metrics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-background border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Всего</p>
                <p className="text-lg font-semibold">{metrics.totalUsers.toLocaleString("ru-RU")}</p>
              </div>
              <div className="rounded-lg bg-background border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">DAU (сегодня)</p>
                <p className="text-lg font-semibold">{metrics.dau.toLocaleString("ru-RU")}</p>
                <p className="text-xs text-muted-foreground">
                  {(metrics.dauShare * 100).toFixed(1)}% от всех
                </p>
              </div>
              <div className="rounded-lg bg-background border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">WAU (7 дней)</p>
                <p className="text-lg font-semibold">{metrics.wau.toLocaleString("ru-RU")}</p>
                <p className="text-xs text-muted-foreground">
                  {(metrics.wauShare * 100).toFixed(1)}% от всех
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Вошли как: {email ?? "неизвестно"}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={queryEmail}
              onChange={(e) => setQueryEmail(e.target.value)}
              placeholder="email пользователя"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="button"
              onClick={fetchUser}
              disabled={!canSearch || loading}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              Найти
            </button>
          </div>
        </div>

        {user ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm"><span className="text-muted-foreground">Email:</span> {user.email}</p>
              <p className="text-sm"><span className="text-muted-foreground">Session:</span> {user.sessionId}</p>
              <p className="text-sm"><span className="text-muted-foreground">Бесплатно осталось:</span> {user.freeRemaining}</p>
              <p className="text-sm"><span className="text-muted-foreground">Платный баланс:</span> {user.requestsBalance}</p>
              <p className="text-sm"><span className="text-muted-foreground">Всего доступно:</span> {user.isUnlimited ? "unlimited" : user.remaining}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-2">Операции</p>
              <div className="flex flex-wrap gap-2">
                {[10, 30, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => grant(n)}
                    disabled={loading}
                    className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-border hover:bg-white/10 disabled:opacity-50"
                  >
                    +{n}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={reconcile}
                  disabled={loading}
                  className="px-3 py-2 rounded-lg text-sm bg-primary/10 border border-primary/30 text-primary disabled:opacity-50"
                >
                  Reconcile платежи
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-medium mb-2">Последние платежи</p>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Платежей не найдено.</p>
              ) : (
                <div className="space-y-2">
                  {payments.map((p) => (
                    <div key={p.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-3 items-center">
                        <span>{new Date(p.createdAt).toLocaleString("ru-RU")}</span>
                        <span>{p.packageCode}</span>
                        <span>+{p.creditsGranted}</span>
                        <span className={p.status === "refunded" ? "text-destructive" : p.status === "succeeded" ? "text-green-400" : ""}>
                          status: {p.status}
                        </span>
                        <span>applied: {p.creditsAppliedAt ? "yes" : "no"}</span>
                        {p.status === "succeeded" && !p.refundedAt && (
                          <button
                            type="button"
                            onClick={() => refund(p.providerPaymentId)}
                            disabled={loading}
                            className="ml-auto px-2 py-1 rounded-md text-xs bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 disabled:opacity-50"
                          >
                            Вернуть
                          </button>
                        )}
                        {p.refundedAt && (
                          <span className="ml-auto text-destructive">↩ возвращён</span>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-1 break-all">
                        {p.providerPaymentId}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}

