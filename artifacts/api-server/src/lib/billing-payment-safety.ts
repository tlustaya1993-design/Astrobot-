import { and, eq, isNull, sql } from "drizzle-orm";
import { db, paymentsTable, usersTable } from "@workspace/db";

export type StoredPaymentForVerification = {
  id: number;
  sessionId: string;
  providerPaymentId: string;
  appPaymentId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type ProviderPaymentForVerification = {
  id: string;
  status: string;
  paid: boolean;
  amount?: {
    value: string;
    currency: string;
  };
  metadata?: Record<string, unknown> | null;
};

export type PaymentVerificationResult =
  | { ok: true; status: string }
  | { ok: false; status: string; reason: string };

function normalizeMoney(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return null;
}

export function verifyYookassaPaymentForCredit(
  stored: StoredPaymentForVerification,
  provider: ProviderPaymentForVerification,
): PaymentVerificationResult {
  const status = provider.status || "unknown";

  if (provider.id !== stored.providerPaymentId) {
    return { ok: false, status, reason: "provider_id_mismatch" };
  }
  if (status !== "succeeded") {
    return { ok: false, status, reason: "provider_status_not_succeeded" };
  }
  if (provider.paid !== true) {
    return { ok: false, status, reason: "provider_not_paid" };
  }
  if (normalizeMoney(provider.amount?.value) !== normalizeMoney(stored.amountRub)) {
    return { ok: false, status, reason: "amount_mismatch" };
  }
  if (provider.amount?.currency !== stored.currency) {
    return { ok: false, status, reason: "currency_mismatch" };
  }

  const metadata = provider.metadata ?? null;
  if (metadataString(metadata, "appPaymentId") !== stored.appPaymentId) {
    return { ok: false, status, reason: "app_payment_id_mismatch" };
  }
  if (metadataString(metadata, "sessionId") !== stored.sessionId) {
    return { ok: false, status, reason: "session_id_mismatch" };
  }
  if (metadataString(metadata, "packageCode") !== stored.packageCode) {
    return { ok: false, status, reason: "package_code_mismatch" };
  }
  if (metadataString(metadata, "credits") !== String(stored.creditsGranted)) {
    return { ok: false, status, reason: "credits_mismatch" };
  }

  return { ok: true, status };
}

export async function applyVerifiedPaymentCreditsIfNeeded(
  paymentId: number,
): Promise<number> {
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
      throw new Error(
        `Cannot apply credits for payment ${paymentId}: user session not found`,
      );
    }

    return claimed.creditsGranted;
  });
}
