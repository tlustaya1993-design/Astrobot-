import { and, eq, isNull, sql } from "drizzle-orm";
import { db, paymentsTable, usersTable, type Payment } from "@workspace/db";

export type YooKassaSettlementPayment = {
  id: string;
  status: string;
  paid: boolean;
  amount?: {
    value: string;
    currency: string;
  };
  metadata?: Record<string, string>;
};

export type YooKassaSettlementVerification = {
  ok: boolean;
  status: string;
  reason?: string;
};

function toKopecks(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function metadataValue(metadata: Record<string, string> | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

export function verifyYooKassaPaymentForSettlement(
  payment: Pick<
    Payment,
    | "providerPaymentId"
    | "appPaymentId"
    | "sessionId"
    | "packageCode"
    | "creditsGranted"
    | "amountRub"
    | "currency"
  >,
  providerPayment: YooKassaSettlementPayment,
): YooKassaSettlementVerification {
  const status = providerPayment.status || "unknown";
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, status, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
    return { ok: false, status, reason: "provider_not_paid" };
  }
  if (providerPayment.amount?.currency !== payment.currency) {
    return { ok: false, status, reason: "currency_mismatch" };
  }
  if (toKopecks(providerPayment.amount?.value) !== toKopecks(payment.amountRub)) {
    return { ok: false, status, reason: "amount_mismatch" };
  }

  const metadata = providerPayment.metadata;
  const expectedCredits = String(payment.creditsGranted);
  if (
    metadataValue(metadata, "appPaymentId") !== payment.appPaymentId ||
    metadataValue(metadata, "sessionId") !== payment.sessionId ||
    metadataValue(metadata, "packageCode") !== payment.packageCode ||
    metadataValue(metadata, "credits") !== expectedCredits
  ) {
    return { ok: false, status, reason: "metadata_mismatch" };
  }

  return { ok: true, status };
}

export async function verifyAndPersistYooKassaPayment(
  payment: Payment,
  providerPayment: YooKassaSettlementPayment,
): Promise<YooKassaSettlementVerification> {
  const verification = verifyYooKassaPaymentForSettlement(payment, providerPayment);
  await db
    .update(paymentsTable)
    .set({
      status: verification.status,
      webhookVerified: verification.ok,
      metadata: providerPayment as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(paymentsTable.id, payment.id));
  return verification;
}

export async function applyVerifiedCreditsIfNeededByPaymentId(paymentId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(paymentsTable)
      .set({
        creditsAppliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentsTable.id, paymentId),
          eq(paymentsTable.status, "succeeded"),
          eq(paymentsTable.webhookVerified, true),
          isNull(paymentsTable.creditsAppliedAt),
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
      throw new Error(`Cannot apply credits: user session ${claimed.sessionId} not found`);
    }

    return claimed.creditsGranted;
  });
}
