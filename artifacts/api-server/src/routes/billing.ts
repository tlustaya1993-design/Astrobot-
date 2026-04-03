import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, paymentsTable, usersTable } from "@workspace/db";
import {
  createYookassaPayment,
  parseYookassaNotification,
  validateYookassaWebhook,
} from "../lib/yookassa.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

type PackageCode = "pack10" | "pack50" | "pack100";

const PACKAGE_CONFIG: Record<
  PackageCode,
  { amountRub: string; credits: number; title: string }
> = {
  pack10: { amountRub: "399.00", credits: 10, title: "AstroBot — 10 запросов" },
  pack50: { amountRub: "1499.00", credits: 50, title: "AstroBot — 50 запросов" },
  pack100: { amountRub: "2499.00", credits: 100, title: "AstroBot — 100 запросов" },
};

const DEFAULT_RECEIPT_EMAIL = "billing@astrobot.app";
let paymentsTableReady: Promise<void> | null = null;

function isPackageCode(value: unknown): value is PackageCode {
  return typeof value === "string" && value in PACKAGE_CONFIG;
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

router.get("/credits", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  const [user] = await db
    .select({
      requestsUsed: usersTable.requestsUsed,
      requestsBalance: usersTable.requestsBalance,
    })
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  const used = user?.requestsUsed ?? 0;
  const balance = user?.requestsBalance ?? 0;
  const remaining = Math.max(0, balance);

  res.json({ used, balance, remaining });
});

router.post("/payments/create", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  const { packageCode, returnUrl } = req.body as {
    packageCode?: string;
    returnUrl?: string;
  };

  if (!isPackageCode(packageCode)) {
    res.status(400).json({ error: "Неверный пакет" });
    return;
  }

  if (!returnUrl || typeof returnUrl !== "string") {
    res.status(400).json({ error: "returnUrl обязателен" });
    return;
  }

  const pkg = PACKAGE_CONFIG[packageCode];
  const appPaymentId = randomUUID();

  await ensureUserSession(sessionId);
  await ensurePaymentsTableExists();
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);
  const receiptEmail = normalizeReceiptEmail(user?.email);

  try {
    const ykPayment = await createYookassaPayment(
      {
        amount: {
          value: pkg.amountRub,
          currency: "RUB",
        },
        capture: true,
        confirmation: {
          type: "redirect",
          return_url: returnUrl,
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
            email: receiptEmail,
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
    logger.error({ err }, "Failed to create yookassa payment");
    const details = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: "Не удалось создать платеж", details });
  }
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
    await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.id, paymentRow.id))
        .limit(1);

      if (!locked) return;
      if (locked.status === "succeeded" && paymentRow.status === "succeeded") return;

      await tx
        .update(usersTable)
        .set({
          requestsBalance: sql`${usersTable.requestsBalance} + ${locked.creditsGranted}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.sessionId, paymentRow.sessionId));
    });
  }

  res.status(200).json({ ok: true });
});

export default router;
