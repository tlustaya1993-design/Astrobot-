import type { Payment } from "@workspace/db";

export type YooKassaPaymentForVerification = {
  id: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  metadata?: Record<string, unknown> | null;
};

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

export type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function toKopecks(value: string | null | undefined): number | null {
  if (!value) return null;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (value == null) return null;
  return String(value);
}

export function verifyYooKassaPaymentForCredits(
  providerPayment: YooKassaPaymentForVerification,
  payment: PaymentForVerification,
): PaymentVerificationResult {
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded") {
    return { ok: false, reason: "provider_status_not_succeeded" };
  }
  if (providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_paid" };
  }
  if (toKopecks(providerPayment.amount?.value) !== toKopecks(payment.amountRub)) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if ((providerPayment.amount?.currency ?? "").toUpperCase() !== payment.currency.toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
  }

  const metadata = providerPayment.metadata;
  if (metadataString(metadata, "appPaymentId") !== payment.appPaymentId) {
    return { ok: false, reason: "app_payment_id_mismatch" };
  }
  if (metadataString(metadata, "sessionId") !== payment.sessionId) {
    return { ok: false, reason: "session_id_mismatch" };
  }
  if (metadataString(metadata, "packageCode") !== payment.packageCode) {
    return { ok: false, reason: "package_code_mismatch" };
  }
  if (metadataString(metadata, "credits") !== String(payment.creditsGranted)) {
    return { ok: false, reason: "credits_mismatch" };
  }

  return { ok: true };
}
