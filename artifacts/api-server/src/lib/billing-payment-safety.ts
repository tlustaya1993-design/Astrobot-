type PaymentRecordForVerification = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

type ProviderPaymentForVerification = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  metadata?: Record<string, unknown>;
};

export type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function normalizeAmount(value: string | undefined): string {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function verifyYookassaPaymentMatchesRecord(
  providerPayment: ProviderPaymentForVerification,
  payment: PaymentRecordForVerification,
): PaymentVerificationResult {
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_paid" };
  }
  if (normalizeAmount(providerPayment.amount?.value) !== normalizeAmount(payment.amountRub)) {
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
