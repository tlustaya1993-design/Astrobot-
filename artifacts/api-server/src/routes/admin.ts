import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, paymentsTable, usersTable, conversations, messages } from "@workspace/db";
import { FREE_REQUESTS_LIMIT, isUnlimitedEmail } from "../lib/billing-policy.js";
import { getYookassaPayment, createYookassaRefund, YooKassaError } from "../lib/yookassa.js";

const router: IRouter = Router();

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().includes(email.trim().toLowerCase());
}

async function resolveEffectiveEmail(req: { authEmail?: string; sessionId?: string }): Promise<string | null> {
  if (req.authEmail?.trim()) return req.authEmail.trim().toLowerCase();
  if (!req.sessionId) return null;
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.sessionId, req.sessionId))
    .limit(1);
  return user?.email?.trim().toLowerCase() ?? null;
}

async function requireAdmin(
  req: { authEmail?: string; sessionId?: string },
  res: { status: (n: number) => { json: (x: unknown) => void } },
): Promise<boolean> {
  const effectiveEmail = await resolveEffectiveEmail(req);
  if (!isAdminEmail(effectiveEmail)) {
    res.status(403).json({ error: "Доступ только для администратора" });
    return false;
  }
  return true;
}

async function applyCreditsIfNeededByPaymentId(paymentId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);

    if (!locked) return 0;
    if (locked.status !== "succeeded") return 0;
    if (locked.creditsAppliedAt) return 0;

    const updated = await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`${usersTable.requestsBalance} + ${locked.creditsGranted}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, locked.sessionId))
      .returning({ id: usersTable.id });

    if (updated.length === 0) return 0;

    await tx
      .update(paymentsTable)
      .set({ creditsAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentsTable.id, paymentId));

    return locked.creditsGranted;
  });
}

type ServiceStatus = "ok" | "degraded" | "error";

interface ServiceCheck {
  id: string;
  name: string;
  status: ServiceStatus;
  message: string;
}

router.get("/status", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const checks: ServiceCheck[] = [];

  // 1. Database — real query
  try {
    await db.execute(sql`SELECT 1`);
    checks.push({ id: "db", name: "База данных", status: "ok", message: "Работает нормально" });
  } catch {
    checks.push({ id: "db", name: "База данных", status: "error", message: "Нет связи — данные недоступны" });
  }

  // 2. Anthropic AI
  const hasAnthropicKey = Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY?.trim()
  );
  checks.push({
    id: "ai",
    name: "Anthropic AI",
    status: hasAnthropicKey ? "ok" : "error",
    message: hasAnthropicKey ? "API-ключ настроен, чат работает" : "Ключ API не найден — чат не работает",
  });

  // 3. YooKassa payments
  const hasYookassa = Boolean(process.env.YOOKASSA_SHOP_ID?.trim() && process.env.YOOKASSA_SECRET_KEY?.trim());
  checks.push({
    id: "payments",
    name: "ЮKassa (платежи)",
    status: hasYookassa ? "ok" : "error",
    message: hasYookassa ? "Приём платежей работает" : "Ключи не найдены — платежи недоступны",
  });

  // 4. Redis / Upstash (optional — used for rate limiting)
  const hasRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  checks.push({
    id: "redis",
    name: "Redis (rate-limit)",
    status: hasRedis ? "ok" : "degraded",
    message: hasRedis ? "Подключён" : "Не настроен — защита от спама отключена",
  });

  // 5. Telegram alerts (optional)
  const hasTelegram = Boolean(
    process.env.TELEGRAM_ADMIN_BOT_TOKEN?.trim() && process.env.TELEGRAM_ADMIN_CHAT_ID?.trim()
  );
  checks.push({
    id: "telegram",
    name: "Telegram-уведомления",
    status: hasTelegram ? "ok" : "degraded",
    message: hasTelegram ? "Уведомления о сбоях приходят" : "Не настроены — сбои приходят молча",
  });

  const hasError = checks.some((c) => c.status === "error");
  const hasDegraded = checks.some((c) => c.status === "degraded");
  const overall: ServiceStatus = hasError ? "error" : hasDegraded ? "degraded" : "ok";

  res.json({ ok: true, overall, checks });
});

router.get("/finance", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";

  const conditions: ReturnType<typeof eq>[] = [eq(paymentsTable.status, "succeeded")];
  if (fromRaw) conditions.push(sql`${paymentsTable.createdAt} >= ${new Date(fromRaw)}` as unknown as ReturnType<typeof eq>);
  if (toRaw) conditions.push(sql`${paymentsTable.createdAt} <= ${new Date(toRaw)}` as unknown as ReturnType<typeof eq>);

  const [row] = await db
    .select({
      revenue: sql<string>`coalesce(sum(case when ${paymentsTable.refundedAt} is null then cast(${paymentsTable.amountRub} as numeric) else 0 end), 0)`,
      refunded: sql<string>`coalesce(sum(case when ${paymentsTable.refundedAt} is not null then cast(${paymentsTable.amountRub} as numeric) else 0 end), 0)`,
      paymentsCount: sql<number>`cast(count(*) as int)`,
    })
    .from(paymentsTable)
    .where(and(...conditions));

  res.json({
    ok: true,
    revenue: parseFloat(row.revenue),
    refunded: parseFloat(row.refunded),
    paymentsCount: row.paymentsCount,
  });
});

router.get("/metrics", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [{ totalUsers }] = await db
    .select({ totalUsers: sql<number>`cast(count(*) as int)` })
    .from(usersTable);

  const [{ dau }] = await db
    .select({ dau: sql<number>`cast(count(distinct ${conversations.sessionId}) as int)` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(sql`${messages.createdAt} >= ${startOfToday}`);

  const [{ wau }] = await db
    .select({ wau: sql<number>`cast(count(distinct ${conversations.sessionId}) as int)` })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(sql`${messages.createdAt} >= ${sevenDaysAgo}`);

  const dauShare = totalUsers > 0 ? dau / totalUsers : 0;
  const wauShare = totalUsers > 0 ? wau / totalUsers : 0;

  res.json({ ok: true, totalUsers, dau, wau, dauShare, wauShare });
});

router.get("/me", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  res.json({ ok: true, email: await resolveEffectiveEmail(req) });
});

router.get("/users", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const rawEmail = typeof req.query.email === "string" ? req.query.email : "";
  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "email обязателен" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.sessionId, user.sessionId))
    .orderBy(sql`${paymentsTable.createdAt} DESC`)
    .limit(20);

  const used = Math.max(0, user.requestsUsed ?? 0);
  const balance = Math.max(0, user.requestsBalance ?? 0);
  const freeRemaining = Math.max(0, FREE_REQUESTS_LIMIT - used);
  const unlimited = isUnlimitedEmail(user.email);

  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      sessionId: user.sessionId,
      requestsUsed: used,
      requestsBalance: balance,
      freeRemaining,
      isUnlimited: unlimited,
      remaining: unlimited ? Number.MAX_SAFE_INTEGER : freeRemaining + balance,
      updatedAt: user.updatedAt,
    },
    payments,
  });
});

router.post("/users/grant-credits", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const credits = Number(req.body?.credits);
  if (!email || !Number.isInteger(credits) || credits <= 0 || credits > 10000) {
    res.status(400).json({ error: "Передайте email и корректное число credits (1..10000)" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      requestsBalance: sql`${usersTable.requestsBalance} + ${credits}`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      sessionId: usersTable.sessionId,
      requestsUsed: usersTable.requestsUsed,
      requestsBalance: usersTable.requestsBalance,
      updatedAt: usersTable.updatedAt,
    });

  res.json({ ok: true, user: updated, granted: credits });
});

router.post("/users/reconcile", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email) {
    res.status(400).json({ error: "email обязателен" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const recentPayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.sessionId, user.sessionId), eq(paymentsTable.provider, "yookassa")))
    .orderBy(sql`${paymentsTable.createdAt} DESC`)
    .limit(5);

  let applied = 0;
  for (const payment of recentPayments) {
    applied += await applyCreditsIfNeededByPaymentId(payment.id);
    if (payment.status !== "succeeded" && payment.providerPaymentId) {
      try {
        const providerPayment = await getYookassaPayment(payment.providerPaymentId);
        if (providerPayment?.status) {
          await db
            .update(paymentsTable)
            .set({
              status: providerPayment.status,
              metadata: providerPayment as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            })
            .where(eq(paymentsTable.id, payment.id));
          if (providerPayment.status === "succeeded") {
            applied += await applyCreditsIfNeededByPaymentId(payment.id);
          }
        }
      } catch {
        // ignore provider sync errors; operator can retry
      }
    }
  }

  const [updatedUser] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      sessionId: usersTable.sessionId,
      requestsUsed: usersTable.requestsUsed,
      requestsBalance: usersTable.requestsBalance,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  res.json({ ok: true, applied, user: updatedUser });
});

router.post("/payments/refund", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const providerPaymentId = typeof req.body?.providerPaymentId === "string"
    ? req.body.providerPaymentId.trim()
    : "";
  if (!providerPaymentId) {
    res.status(400).json({ error: "providerPaymentId обязателен" });
    return;
  }

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(and(
      eq(paymentsTable.provider, "yookassa"),
      eq(paymentsTable.providerPaymentId, providerPaymentId),
    ))
    .limit(1);

  if (!payment) {
    res.status(404).json({ error: "Платёж не найден" });
    return;
  }
  if (payment.status === "refunded") {
    res.status(409).json({ error: "Платёж уже возвращён" });
    return;
  }
  if (payment.status !== "succeeded") {
    res.status(409).json({ error: "Возврат возможен только для успешных платежей" });
    return;
  }

  let refundId: string;
  try {
    const refund = await createYookassaRefund(
      providerPaymentId,
      { value: payment.amountRub, currency: payment.currency },
      { idempotenceKey: randomUUID() },
    );
    refundId = refund.id;
  } catch (err) {
    const msg = err instanceof YooKassaError
      ? `Ошибка ЮKassa: ${err.message}`
      : "Не удалось выполнить возврат через ЮKassa";
    res.status(502).json({ error: msg });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(paymentsTable)
      .set({
        status: "refunded",
        providerRefundId: refundId,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, payment.id));

    // Списываем кредиты — не уходим в минус
    await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`GREATEST(0, ${usersTable.requestsBalance} - ${payment.creditsGranted})`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, payment.sessionId));
  });

  const [updatedUser] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      requestsBalance: usersTable.requestsBalance,
    })
    .from(usersTable)
    .where(eq(usersTable.sessionId, payment.sessionId))
    .limit(1);

  res.json({ ok: true, refundId, user: updatedUser });
});

export default router;

