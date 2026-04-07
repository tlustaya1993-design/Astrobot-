import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, paymentsTable, usersTable } from "@workspace/db";
import {
  createYookassaPayment,
  parseYookassaNotification,
  YooKassaError,
  validateYookassaWebhook,
} from "../lib/yookassa.js";
import { logger } from "../lib/logger.js";
import {
  FREE_REQUESTS_LIMIT,
  isUnlimitedEmail,
} from "../lib/billing-policy.js";

const router: IRouter = Router();

type PackageCode = "pack10" | "pack30" | "pack50" | "pack100";

const PACKAGE_CONFIG: Record<
  PackageCode,
  { amountRub: string; credits: number; title: string }
> = {
  pack10: { amountRub: "349.00", credits: 10, title: "AstroBot — Старт, 10 запросов" },
  pack30: { amountRub: "799.00", credits: 30, title: "AstroBot — Стандарт, 30 запросов" },
  pack50: { amountRub: "1149.00", credits: 50, title: "AstroBot — Про, 50 запросов" },
  pack100: { amountRub: "1799.00", credits: 100, title: "AstroBot — Макс, 100 запросов" },
};

const DEFAULT_RECEIPT_EMAIL = "billing@astrobot.app";
let paymentsTableReady: Promise<void> | null = null;
const paymentCreateThrottle = new Map<string, number>();

const PAYMENT_SUCCESS_RETURN_FLAG = "payment=success";
const CREATE_PAYMENT_MIN_INTERVAL_MS = 2_500;
const CREATE_PAYMENT_RETRY_DELAY_MS = 500;

function isPackageCode(value: unknown): value is PackageCode {
  return typeof value === "string" && value in PACKAGE_CONFIG;
}

function getClientIp(req: {
  headers?: Record<string, unknown>;
  ip?: string;
}): string {
  const h = req.headers?.["x-forwarded-for"];
  if (typeof h === "string" && h.trim()) {
    return h.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(h) && h[0]) {
    return String(h[0]);
  }
  return req.ip ?? "unknown";
}

function canCreatePaymentNow(key: string, now = Date.now()): { ok: boolean; waitMs: number } {
  const prev = paymentCreateThrottle.get(key);
  if (!prev) {
    paymentCreateThrottle.set(key, now);
    return { ok: true, waitMs: 0 };
  }
  const diff = now - prev;
  if (diff >= CREATE_PAYMENT_MIN_INTERVAL_MS) {
    paymentCreateThrottle.set(key, now);
    return { ok: true, waitMs: 0 };
  }
  return { ok: false, waitMs: CREATE_PAYMENT_MIN_INTERVAL_MS - diff };
}

function cleanupPaymentThrottle(now = Date.now()): void {
  // Простая защита от бесконечного роста map: TTL 10 минут.
  const ttl = 10 * 60_000;
  for (const [k, ts] of paymentCreateThrottle.entries()) {
    if (now - ts > ttl) paymentCreateThrottle.delete(k);
  }
}

function isRetriableProviderError(err: unknown): boolean {
  if (!(err instanceof YooKassaError)) return false;
  if (err.kind === "timeout" || err.kind === "network") return true;
  return err.kind === "http" && (err.status === 429 || (err.status != null && err.status >= 500));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPaymentWithRetry(
  args: Parameters<typeof createYookassaPayment>[0],
  options: Parameters<typeof createYookassaPayment>[1],
): Promise<Awaited<ReturnType<typeof createYookassaPayment>>> {
  try {
    return await createYookassaPayment(args, options);
  } catch (firstErr) {
    if (!isRetriableProviderError(firstErr)) throw firstErr;
    await sleep(CREATE_PAYMENT_RETRY_DELAY_MS + Math.floor(Math.random() * 250));
    return createYookassaPayment(args, options);
  }
}

function inferPaymentFailureResponse(err: unknown): { status: number; error: string } {
  if (err instanceof YooKassaError) {
    if (err.kind === "timeout") {
      return {
        status: 504,
        error: "Платёжный сервис не ответил вовремя. Попробуйте ещё раз.",
      };
    }
    if (err.kind === "network") {
      return {
        status: 503,
        error: "Платёжный сервис временно недоступен. Попробуйте ещё раз.",
      };
    }
    if (err.kind === "config") {
      return {
        status: 500,
        error: "Платёжная интеграция настроена некорректно.",
      };
    }
    if (err.kind === "http") {
      if (err.status === 400 || err.status === 422) {
        return {
          status: 400,
          error: "Параметры платежа отклонены платёжным провайдером.",
        };
      }
      if (err.status === 401 || err.status === 403) {
        return {
          status: 502,
          error: "Проблема авторизации в платёжном провайдере.",
        };
      }
      if (err.status === 429) {
        return {
          status: 503,
          error: "Слишком много запросов к платёжному провайдеру. Повторите чуть позже.",
        };
      }
      if (err.status && err.status >= 500) {
        return {
          status: 503,
          error: "Платёжный провайдер временно недоступен. Повторите чуть позже.",
        };
      }
    }
  }

  return { status: 500, error: "Не удалось создать платеж" };
}

function toKopecks(amountRub: string): number {
  const parsed = Number.parseFloat(amountRub);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid amount: ${amountRub}`);
  }
  return Math.round(parsed * 100);
}

async function ensureUserSession(sessionId: string) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(usersTable)
    .values({ sessionId })
    .returning();

  return created;
}

function normalizeReceiptEmail(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return DEFAULT_RECEIPT_EMAIL;
  const email = value.trim().toLowerCase();
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return DEFAULT_RECEIPT_EMAIL;
  }
  return email;
}

/** Для гостевой оплаты: обязателен реальный email в чек ЮKassa (не fallback). */
function isValidReceiptEmailForGuest(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim().toLowerCase();
  if (email.length < 5 || !email.includes("@")) return false;
  if (email.startsWith("@") || email.endsWith("@")) return false;
  return normalizeReceiptEmail(email) !== DEFAULT_RECEIPT_EMAIL;
}

function appendReturnFlag(returnUrl: string): string {
  try {
    const url = new URL(returnUrl);
    url.searchParams.set("payment", "success");
    return url.toString();
  } catch {
    const separator = returnUrl.includes("?") ? "&" : "?";
    return `${returnUrl}${separator}${PAYMENT_SUCCESS_RETURN_FLAG}`;
  }
}

async function ensurePaymentsTableExists(): Promise<void> {
  if (!paymentsTableReady) {
    paymentsTableReady = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS payments (
          id serial PRIMARY KEY,
          session_id text NOT NULL,
          provider text NOT NULL DEFAULT 'yookassa',
          provider_payment_id text NOT NULL UNIQUE,
          app_payment_id text NOT NULL UNIQUE,
          package_code text NOT NULL,
          credits_granted integer NOT NULL,
          amount_rub text NOT NULL,
          currency text NOT NULL DEFAULT 'RUB',
          status text NOT NULL DEFAULT 'pending',
          description text,
          metadata_json text,
          webhook_verified boolean NOT NULL DEFAULT false,
          metadata jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          credits_applied_at timestamptz
        )
      `);
    })().catch((error) => {
      paymentsTableReady = null;
      throw error;
    });
  }

  await paymentsTableReady;
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

    await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`${usersTable.requestsBalance} + ${locked.creditsGranted}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, locked.sessionId));

    await tx
      .update(paymentsTable)
      .set({ creditsAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentsTable.id, paymentId));

    return locked.creditsGranted;
  });
}

router.get("/credits", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  const [user] = await db
    .select({
      email: usersTable.email,
      requestsUsed: usersTable.requestsUsed,
      requestsBalance: usersTable.requestsBalance,
    })
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  const used = user?.requestsUsed ?? 0;
  const balance = user?.requestsBalance ?? 0;
  const freeRemaining = Math.max(0, FREE_REQUESTS_LIMIT - used);
  const isUnlimited = isUnlimitedEmail(user?.email);
  const remaining = isUnlimited ? Number.MAX_SAFE_INTEGER : freeRemaining + Math.max(0, balance);

  res.json({
    used,
    balance,
    freeRemaining,
    remaining,
    isUnlimited,
    freeLimit: FREE_REQUESTS_LIMIT,
  });
});

router.post("/payments/create", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  const { packageCode, returnUrl, receiptEmail } = req.body as {
    packageCode?: string;
    returnUrl?: string;
    /** Для анонимов — email для чека ЮKassa (обязателен, если нет email в профиле). */
    receiptEmail?: string;
  };

  if (!isPackageCode(packageCode)) {
    res.status(400).json({ error: "Неверный пакет" });
    return;
  }

  if (!returnUrl || typeof returnUrl !== "string") {
    res.status(400).json({ error: "returnUrl обязателен" });
    return;
  }

  cleanupPaymentThrottle();
  const clientIp = getClientIp(req);
  const perSessionAllowed = canCreatePaymentNow(`sid:${sessionId}`);
  const perIpAllowed = canCreatePaymentNow(`ip:${clientIp}`);
  const allowed = !perSessionAllowed.ok
    ? perSessionAllowed
    : perIpAllowed;
  if (!allowed.ok) {
    const waitSec = Math.max(1, Math.ceil(allowed.waitMs / 1000));
    res.setHeader("Retry-After", String(waitSec));
    res.status(429).json({
      error: "Слишком частые попытки оплаты. Повторите через пару секунд.",
      retryAfterSec: waitSec,
    });
    return;
  }

  const pkg = PACKAGE_CONFIG[packageCode];
  const appPaymentId = randomUUID();
  const paymentReturnUrl = appendReturnFlag(returnUrl);

  await ensureUserSession(sessionId);
  await ensurePaymentsTableExists();
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  let receiptForYoo: string;
  if (user?.email && user.email.trim()) {
    receiptForYoo = normalizeReceiptEmail(user.email);
  } else if (isValidReceiptEmailForGuest(receiptEmail)) {
    receiptForYoo = normalizeReceiptEmail(receiptEmail);
  } else {
    res.status(400).json({
      error: "Укажите email для чека — он нужен для ЮKassa. Регистрация не обязательна.",
    });
    return;
  }

  try {
    const ykPayment = await createPaymentWithRetry(
      {
        amount: {
          value: pkg.amountRub,
          currency: "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: paymentReturnUrl,
        },
        description: pkg.title,
        metadata: {
          appPaymentId,
          sessionId,
          packageCode,
          credits: String(pkg.credits),
        },
        receipt: {
          customer: {
            email: receiptForYoo,
          },
          items: [
            {
              description: pkg.title,
              quantity: "1.00",
              amount: {
                value: pkg.amountRub,
                currency: "RUB",
              },
              vat_code: 1,
              payment_mode: "full_payment",
              payment_subject: "service",
            },
          ],
        },
      },
      { idempotenceKey: appPaymentId },
    );

    await db.insert(paymentsTable).values({
      sessionId,
      provider: "yookassa",
      providerPaymentId: ykPayment.id,
      appPaymentId,
      packageCode,
      creditsGranted: pkg.credits,
      amountRub: pkg.amountRub,
      currency: "RUB",
      status: ykPayment.status,
      description: pkg.title,
      metadataJson: JSON.stringify(ykPayment),
      metadata: {
        appPaymentId,
        yookassa: ykPayment,
      },
    });

    res.json({
      appPaymentId,
      confirmationUrl: ykPayment.confirmation?.confirmation_url ?? null,
      providerPaymentId: ykPayment.id,
      status: ykPayment.status,
    });
  } catch (err) {
    const failure = inferPaymentFailureResponse(err);
    if (err instanceof YooKassaError) {
      logger.error(
        {
          err,
          appPaymentId,
          sessionId,
          packageCode,
          provider: "yookassa",
          yookassa: {
            kind: err.kind,
            operation: err.operation,
            status: err.status,
            requestId: err.requestId,
            body: err.body,
          },
        },
        "Failed to create yookassa payment",
      );
    } else {
      logger.error(
        {
          err,
          appPaymentId,
          sessionId,
          packageCode,
          provider: "yookassa",
        },
        "Failed to create yookassa payment",
      );
    }
    if (failure.status === 503 || failure.status === 504 || failure.status === 429) {
      res.setHeader("Retry-After", "2");
    }
    res.status(failure.status).json({ error: failure.error });
  }
});

router.post("/payments/reconcile", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }
  await ensurePaymentsTableExists();

  const [latest] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.sessionId, sessionId),
        eq(paymentsTable.provider, "yookassa"),
      ),
    )
    .orderBy(sql`${paymentsTable.createdAt} DESC`)
    .limit(1);

  if (!latest) {
    res.json({ ok: true, applied: 0, status: "none" });
    return;
  }

  const applied = await applyCreditsIfNeededByPaymentId(latest.id);
  res.json({ ok: true, applied, status: latest.status });
});

router.post("/payments/webhook", async (req, res) => {
  if (!validateYookassaWebhook(req)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }
  await ensurePaymentsTableExists();

  const notification = parseYookassaNotification(req.body);
  if (!notification) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  const providerPaymentId = notification.object.id;
  const [paymentRow] = await db
    .select()
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.provider, "yookassa"),
        eq(paymentsTable.providerPaymentId, providerPaymentId),
      ),
    )
    .limit(1);

  if (!paymentRow) {
    logger.warn({ providerPaymentId }, "Unknown payment webhook");
    res.status(200).json({ ok: true });
    return;
  }

  const nextStatus = notification.object.status;

  await db
    .update(paymentsTable)
    .set({
      status: nextStatus,
      metadata: notification.object as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(paymentsTable.id, paymentRow.id));

  if (nextStatus === "succeeded") {
    await applyCreditsIfNeededByPaymentId(paymentRow.id);
  }

  res.status(200).json({ ok: true });
});

export default router;
