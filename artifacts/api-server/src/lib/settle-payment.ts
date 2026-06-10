import { and, eq, sql } from "drizzle-orm";
import {
  db,
  paymentsTable,
  requestLedgerTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger.js";

export type SettlePaymentResult = {
  applied: number;
  status: string;
  paymentId?: number;
};

/**
 * Idempotent payment settlement: webhook + reconcile share this path.
 * Locks payment row, credits balance once, writes ledger credit entry.
 */
type DbClient = Pick<typeof db, "transaction">;

export async function settlePayment(
  providerPaymentId: string,
  options?: {
    status?: string;
    metadata?: Record<string, unknown> | null;
  },
  database: DbClient = db,
): Promise<SettlePaymentResult> {
  return database.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(paymentsTable)
      .where(
        and(
          eq(paymentsTable.provider, "yookassa"),
          eq(paymentsTable.providerPaymentId, providerPaymentId),
        ),
      )
      .for("update")
      .limit(1);

    if (!payment) {
      return { applied: 0, status: "not_found" };
    }

    if (options?.status && options.status !== payment.status) {
      await tx
        .update(paymentsTable)
        .set({
          status: options.status,
          metadata: (options.metadata ?? payment.metadata) as Record<string, unknown> | null,
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));
    }

    const effectiveStatus = options?.status ?? payment.status;

    if (payment.creditsAppliedAt) {
      return { applied: 0, status: effectiveStatus, paymentId: payment.id };
    }

    if (effectiveStatus !== "succeeded") {
      return { applied: 0, status: effectiveStatus, paymentId: payment.id };
    }

    const idempotencyKey = `credit:payment:${providerPaymentId}`;

    const [existingLedger] = await tx
      .select({ id: requestLedgerTable.id })
      .from(requestLedgerTable)
      .where(eq(requestLedgerTable.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingLedger) {
      await tx
        .update(paymentsTable)
        .set({ creditsAppliedAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(paymentsTable.id, payment.id), sql`${paymentsTable.creditsAppliedAt} IS NULL`),
        );
      return { applied: 0, status: "succeeded", paymentId: payment.id };
    }

    const [owner] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.sessionId, payment.sessionId))
      .for("update")
      .limit(1);

    if (!owner) {
      logger.warn(
        { event: "billing.credit_skipped", providerPaymentId, sessionId: payment.sessionId },
        "settlePayment: user row missing",
      );
      return { applied: 0, status: "user_missing", paymentId: payment.id };
    }

    await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`${usersTable.requestsBalance} + ${payment.creditsGranted}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, payment.sessionId));

    await tx.insert(requestLedgerTable).values({
      sessionId: payment.sessionId,
      userId: owner.id,
      type: "credit",
      amount: payment.creditsGranted,
      idempotencyKey,
      refType: "payment",
      refId: providerPaymentId,
      metadata: {
        packageCode: payment.packageCode,
        paymentId: payment.id,
      },
    });

    await tx
      .update(paymentsTable)
      .set({ creditsAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentsTable.id, payment.id));

    logger.info(
      {
        event: "billing.credit",
        providerPaymentId,
        sessionId: payment.sessionId,
        userId: owner.id,
        credits: payment.creditsGranted,
        paymentId: payment.id,
      },
      "Payment credits applied",
    );

    return {
      applied: payment.creditsGranted,
      status: "succeeded",
      paymentId: payment.id,
    };
  });
}

export async function settlePaymentByInternalId(paymentId: number): Promise<SettlePaymentResult> {
  const [payment] = await db
    .select({ providerPaymentId: paymentsTable.providerPaymentId })
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId))
    .limit(1);
  if (!payment) return { applied: 0, status: "not_found" };
  return settlePayment(payment.providerPaymentId);
}
