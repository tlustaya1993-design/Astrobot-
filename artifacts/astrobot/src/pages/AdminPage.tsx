import React, { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/lib/session";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";

type AdminMetrics = {
  registered: number;
  activeGuests: number;
  emptySessions: number;
  testSessions: number;
  dau: number;
  wau: number;
  dauShare: number;
  wauShare: number;
};

type ServiceStatus = "ok" | "degraded" | "error";

type ServiceCheck = {
  id: string;
  name: string;
  status: ServiceStatus;
  message: string;
};

type SystemStatus = {
  overall: ServiceStatus;
  checks: ServiceCheck[];
};

type AdminFinance = {
  revenue: number;
  refunded: number;
  paymentsCount: number;
};

type FinancePeriod = "today" | "7d" | "30d" | "all" | "custom";

const PERIOD_LABELS: Record<FinancePeriod, string> = {
  today: "Сегодня",
  "7d": "7 дней",
  "30d": "30 дней",
  all: "Всё время",
  custom: "Период",
};

function getPeriodDates(period: FinancePeriod, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  if (period === "today") {
    return { from: todayStart.toISOString(), to: now.toISOString() };
  }
  if (period === "7d") {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: d.toISOString(), to: now.toISOString() };
  }
  if (period === "30d") {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: d.toISOString(), to: now.toISOString() };
  }
  if (period === "custom") {
    const to = customTo ? new Date(customTo + "T23:59:59").toISOString() : now.toISOString();
    return { from: customFrom ? new Date(customFrom).toISOString() : "", to };
  }
  return { from: "", to: "" }; // all
}

function fmtRub(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
}

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
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const canSearch = useMemo(() => queryEmail.trim().length > 4, [queryEmail]);

  const fetchMetrics = async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch("/api/admin/metrics", { headers: getAuthHeaders() });
      const payload = (await res.json()) as { ok?: boolean; error?: string } & Partial<AdminMetrics>;
      if (!res.ok || !payload.ok) throw new Error(payload.error || `Ошибка (${res.status})`);
      setMetrics({
        registered: payload.registered ?? 0,
        activeGuests: payload.activeGuests ?? 0,
        emptySessions: payload.emptySessions ?? 0,
        testSessions: payload.testSessions ?? 0,
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

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/admin/status", { headers: getAuthHeaders() });
      const payload = (await res.json()) as { ok?: boolean; overall?: ServiceStatus; checks?: ServiceCheck[] };
      if (!res.ok || !payload.ok) throw new Error();
      setSystemStatus({ overall: payload.overall ?? "error", checks: payload.checks ?? [] });
    } catch {
      // best-effort
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchFinance = async (period: FinancePeriod, cfrom: string, cto: string) => {
    setFinanceLoading(true);
    try {
      const { from, to } = getPeriodDates(period, cfrom, cto);
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/finance?${params.toString()}`, { headers: getAuthHeaders() });
      const payload = (await res.json()) as { ok?: boolean; error?: string } & Partial<AdminFinance>;
      if (!res.ok || !payload.ok) throw new Error(payload.error || `Ошибка (${res.status})`);
      setFinance({
        revenue: payload.revenue ?? 0,
        refunded: payload.refunded ?? 0,
        paymentsCount: payload.paymentsCount ?? 0,
      });
    } catch {
      // best-effort
    } finally {
      setFinanceLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchStatus();
      fetchMetrics();
      fetchFinance(financePeriod, customFrom, customTo);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const handlePeriodChange = (p: FinancePeriod) => {
    setFinancePeriod(p);
    if (p !== "custom") fetchFinance(p, customFrom, customTo);
  };

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

        {/* System status */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Состояние системы</p>
            <button
              type="button"
              onClick={fetchStatus}
              disabled={statusLoading}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {statusLoading ? "Проверяю..." : "Обновить"}
            </button>
          </div>

          {statusLoading && !systemStatus ? (
            <p className="text-sm text-muted-foreground">Проверяю...</p>
          ) : systemStatus ? (
            <div className="space-y-3">
              {/* Overall banner */}
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${
                systemStatus.overall === "ok"
                  ? "bg-green-500/10 border border-green-500/25"
                  : systemStatus.overall === "degraded"
                  ? "bg-amber-500/10 border border-amber-500/25"
                  : "bg-destructive/10 border border-destructive/25"
              }`}>
                <span className="text-lg leading-none">
                  {systemStatus.overall === "ok" ? "✅" : systemStatus.overall === "degraded" ? "⚠️" : "🔴"}
                </span>
                <span className={`text-sm font-medium ${
                  systemStatus.overall === "ok"
                    ? "text-green-400"
                    : systemStatus.overall === "degraded"
                    ? "text-amber-400"
                    : "text-destructive"
                }`}>
                  {systemStatus.overall === "ok"
                    ? "Всё работает нормально"
                    : systemStatus.overall === "degraded"
                    ? "Работает, но кое-что не настроено"
                    : "Есть серьёзные проблемы"}
                </span>
              </div>

              {/* Per-service list */}
              <div className="space-y-1.5">
                {systemStatus.checks.map((svc) => (
                  <div key={svc.id} className="flex items-start gap-2.5 rounded-lg px-3 py-2 bg-background border border-border">
                    <span className="mt-0.5 text-sm leading-none">
                      {svc.status === "ok" ? "🟢" : svc.status === "degraded" ? "🟡" : "🔴"}
                    </span>
                    <div>
                      <p className="text-sm font-medium leading-tight">{svc.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Доходы</p>
            <div className="flex gap-1 flex-wrap">
              {(["today", "7d", "30d", "all", "custom"] as FinancePeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePeriodChange(p)}
                  className={`px-2 py-1 rounded-md text-xs border ${financePeriod === p ? "bg-primary text-primary-foreground border-primary" : "border-border bg-transparent text-muted-foreground hover:bg-white/5"}`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {financePeriod === "custom" && (
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">С</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none focus:border-primary/50"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">По</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-background border border-border rounded-lg px-2 py-1 text-sm outline-none focus:border-primary/50"
                />
              </div>
              <button
                type="button"
                onClick={() => fetchFinance("custom", customFrom, customTo)}
                disabled={financeLoading}
                className="px-3 py-1 rounded-lg text-sm bg-primary text-primary-foreground disabled:opacity-50"
              >
                Применить
              </button>
            </div>
          )}

          {financeLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : finance ? (() => {
            const profit = finance.revenue - finance.refunded;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-background border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Доход (без возвратов)</p>
                    <p className="text-lg font-semibold text-green-400">{fmtRub(finance.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{finance.paymentsCount} платежей</p>
                  </div>
                  <div className="rounded-lg bg-background border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Возвраты</p>
                    <p className="text-lg font-semibold text-destructive">{fmtRub(finance.refunded)}</p>
                  </div>
                  <div className="rounded-lg bg-background border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Чистая прибыль</p>
                    <p className={`text-lg font-semibold ${profit >= 0 ? "text-green-400" : "text-destructive"}`}>
                      {fmtRub(profit)}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2.5 space-y-1">
                  <p className="text-xs font-medium text-amber-400">AI расходы — не отслеживаются</p>
                  <p className="text-xs text-muted-foreground">
                    Маржа и реальная прибыль будут доступны после подключения учёта токенов Anthropic.
                    Для этого нужно добавить колонки <code className="text-xs bg-white/10 px-1 rounded">input_tokens</code> и <code className="text-xs bg-white/10 px-1 rounded">output_tokens</code> в таблицу <code className="text-xs bg-white/10 px-1 rounded">messages</code> и сохранять <code className="text-xs bg-white/10 px-1 rounded">response.usage</code> после каждого вызова API.
                  </p>
                </div>
              </div>
            );
          })() : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Пользователи</p>
          {metricsLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          ) : metrics ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg bg-background border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Зарегистрированных</p>
                  <p className="text-lg font-semibold">{metrics.registered.toLocaleString("ru-RU")}</p>
                  <p className="text-xs text-muted-foreground">с email-аккаунтом</p>
                </div>
                <div className="rounded-lg bg-background border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Активных гостей</p>
                  <p className="text-lg font-semibold">{metrics.activeGuests.toLocaleString("ru-RU")}</p>
                  <p className="text-xs text-muted-foreground">анонимы, пользовались чатом</p>
                </div>
                <div className="rounded-lg bg-background border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Пустых сессий</p>
                  <p className="text-lg font-semibold text-muted-foreground">{metrics.emptySessions.toLocaleString("ru-RU")}</p>
                  <p className="text-xs text-muted-foreground">зашли, ничего не сделали</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-background border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">DAU (сегодня)</p>
                  <p className="text-lg font-semibold">{metrics.dau.toLocaleString("ru-RU")}</p>
                  <p className="text-xs text-muted-foreground">
                    {(metrics.dauShare * 100).toFixed(1)}% от зарегистрированных
                  </p>
                </div>
                <div className="rounded-lg bg-background border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">WAU (7 дней)</p>
                  <p className="text-lg font-semibold">{metrics.wau.toLocaleString("ru-RU")}</p>
                  <p className="text-xs text-muted-foreground">
                    {(metrics.wauShare * 100).toFixed(1)}% от зарегистрированных
                  </p>
                </div>
              </div>

              {metrics.testSessions > 0 && (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                  <p className="text-xs text-amber-400">
                    {metrics.testSessions.toLocaleString("ru-RU")} тестовых сессий помечено флагом <code className="bg-white/10 px-1 rounded">is_test</code> — они исключены из всех метрик выше
                  </p>
                </div>
              )}
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

