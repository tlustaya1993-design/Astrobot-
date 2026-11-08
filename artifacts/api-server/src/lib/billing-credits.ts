import { and, eq, sql } from "drizzle-orm";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { getYookassaPayment } from "./yookassa.js";
import { logger } from "./logger.js";
import {
  verifyYooKassaPaymentForCredits,
  type YooKassaPaymentForVerification,
} from "./billing-payment-safety.js";

type PaymentRow = typeof paymentsTable.$inferSelect;

/**
 * Atomically claim an unapplied, verified succeeded payment and credit the user.
 * Safe under concurrent webhook + reconcile.
 */
export async function applyCreditsIfNeededByPaymentId(paymentId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);

    if (!locked) return 0;
    if (locked.status !== "succeeded") return 0;
    if (!locked.webhookVerified) return 0;
    if (locked.creditsAppliedAt) return 0;

    const [claimed] = await tx
      .update(paymentsTable)
      .set({ creditsAppliedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(paymentsTable.id, paymentId),
          eq(paymentsTable.status, "succeeded"),
          eq(paymentsTable.webhookVerified, true),
          sql`${paymentsTable.creditsAppliedAt} IS NULL`,
        ),
      )
      .returning({
        sessionId: paymentsTable.sessionId,
        creditsGranted: paymentsTable.creditsGranted,
      });

    if (!claimed) return 0;

    const updated = await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`${usersTable.requestsBalance} + ${claimed.creditsGranted}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, claimed.sessionId))
      .returning({ id: usersTable.id });

    if (updated.length === 0) {
      throw new Error(`Cannot apply credits: user session not found for payment ${paymentId}`);
    }

    return claimed.creditsGranted;
  });
}

/**
 * Re-fetch payment from YooKassa and mark webhookVerified only when settlement
 * matches the local payment row (id, paid, amount, metadata).
 */
export async function syncYooKassaPaymentFromProvider(
  paymentRow: PaymentRow,
  source: "webhook" | "reconcile" | "admin",
): Promise<{ status: string; verifiedForCredits: boolean }> {
  const providerPayment = await getYookassaPayment(paymentRow.providerPaymentId);
  const verification = verifyYooKassaPaymentForCredits(
    paymentRow,
    providerPayment as YooKassaPaymentForVerification,
  );
  const verifiedForCredits = verification.ok;
  const verificationFailureReason = verification.ok ? null : verification.reason;
  const statusToPersist =
    providerPayment.status === "succeeded" && !verifiedForCredits
      ? paymentRow.status
      : providerPayment.status;

  await db
    .update(paymentsTable)
    .set({
      status: statusToPersist,
      metadata: providerPayment as unknown as Record<string, unknown>,
      webhookVerified: verifiedForCredits ? true : paymentRow.webhookVerified,
      updatedAt: new Date(),
    })
    .where(eq(paymentsTable.id, paymentRow.id));

  if (providerPayment.status === "succeeded" && !verifiedForCredits) {
    logger.warn(
      {
        paymentId: paymentRow.id,
        providerPaymentId: paymentRow.providerPaymentId,
        source,
        reason: verificationFailureReason,
      },
      "YooKassa payment did not match local payment row; credits not applied",
    );
  }

  return {
    status: statusToPersist,
    verifiedForCredits: verifiedForCredits || paymentRow.webhookVerified,
  };
}
