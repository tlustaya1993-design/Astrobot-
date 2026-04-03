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
      },
      { idempotenceKey: appPaymentId },
    );

    await db.insert(paymentsTable).values({
      sessionId,
      provider: "yookassa",
      providerPaymentId: ykPayment.id,
      packageId: packageCode,
      requestsPurchased: pkg.credits,
      amountRub: toKopecks(pkg.amountRub),
      currency: "RUB",
      status: ykPayment.status,
      description: pkg.title,
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
    res.status(500).json({ error: "Не удалось создать платеж" });
  }
});

router.post("/payments/webhook", async (req, res) => {
  if (!validateYookassaWebhook(req)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

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
          requestsBalance: sql`${usersTable.requestsBalance} + ${locked.requestsPurchased}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.sessionId, paymentRow.sessionId));
    });
  }

  res.status(200).json({ ok: true });
});

export default router;
