import type { Payment } from "@workspace/db";

export type YooKassaPaymentForVerification = {
  id: string;
  status: string;
  paid: boolean;
  amount?: {
    value: string;
    currency: string;
  };
  metadata?: Record<string, unknown>;
};

type PaymentVerificationRow = Pick<
  Payment,
  | "providerPaymentId"
  | "appPaymentId"
  | "sessionId"
  | "packageCode"
  | "creditsGranted"
  | "amountRub"
  | "currency"
>;

export type YooKassaPaymentVerification =
  | { ok: true }
  | { ok: false; reason: string };

function amountToKopecks(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [rubles, kopecks = ""] = trimmed.split(".");
  return Number.parseInt(rubles, 10) * 100 + Number.parseInt(kopecks.padEnd(2, "0"), 10);
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (value == null) return null;
  return String(value);
}

export function verifyYooKassaPaymentForCredits(
  payment: PaymentVerificationRow,
  providerPayment: YooKassaPaymentForVerification,
): YooKassaPaymentVerification {
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded") {
    return { ok: false, reason: "provider_status_not_succeeded" };
  }
  if (providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_paid" };
  }

  const providerAmount = providerPayment.amount;
  if (!providerAmount) {
    return { ok: false, reason: "provider_amount_missing" };
  }
  if (providerAmount.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    return { ok: false, reason: "provider_currency_mismatch" };
  }

  const expectedKopecks = amountToKopecks(payment.amountRub);
  const actualKopecks = amountToKopecks(providerAmount.value);
  if (expectedKopecks == null || actualKopecks == null || expectedKopecks !== actualKopecks) {
    return { ok: false, reason: "provider_amount_mismatch" };
  }

  const metadata = providerPayment.metadata;
  const expectedMetadata: Record<string, string> = {
    appPaymentId: payment.appPaymentId,
    sessionId: payment.sessionId,
    packageCode: payment.packageCode,
    credits: String(payment.creditsGranted),
  };

  for (const [key, expected] of Object.entries(expectedMetadata)) {
    if (metadataString(metadata, key) !== expected) {
      return { ok: false, reason: `provider_metadata_${key}_mismatch` };
    }
  }

  return { ok: true };
}
