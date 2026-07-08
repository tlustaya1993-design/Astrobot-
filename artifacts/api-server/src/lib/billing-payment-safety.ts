import type { Payment } from "@workspace/db";

type PaymentForVerification = Pick<
  Payment,
  | "providerPaymentId"
  | "appPaymentId"
  | "sessionId"
  | "packageCode"
  | "creditsGranted"
  | "amountRub"
  | "currency"
>;

type ProviderPaymentForVerification = {
  id?: unknown;
  status?: unknown;
  paid?: unknown;
  amount?: {
    value?: unknown;
    currency?: unknown;
  } | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function metadataValue(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = metadata?.[key];
  if (value === undefined || value === null) return null;
  return String(value);
}

export function verifyYookassaPaymentMatchesRecord(
  payment: PaymentForVerification,
  providerPayment: ProviderPaymentForVerification,
): PaymentVerificationResult {
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }

  if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_succeeded" };
  }

  if (
    providerPayment.amount?.value !== payment.amountRub
    || providerPayment.amount?.currency !== payment.currency
  ) {
    return { ok: false, reason: "amount_or_currency_mismatch" };
  }

  const metadata = providerPayment.metadata;
  if (metadataValue(metadata, "appPaymentId") !== payment.appPaymentId) {
    return { ok: false, reason: "app_payment_id_mismatch" };
  }
  if (metadataValue(metadata, "sessionId") !== payment.sessionId) {
    return { ok: false, reason: "session_id_mismatch" };
  }
  if (metadataValue(metadata, "packageCode") !== payment.packageCode) {
    return { ok: false, reason: "package_code_mismatch" };
  }
  if (metadataValue(metadata, "credits") !== String(payment.creditsGranted)) {
    return { ok: false, reason: "credits_mismatch" };
  }

  return { ok: true };
}
