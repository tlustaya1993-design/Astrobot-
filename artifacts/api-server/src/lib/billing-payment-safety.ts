export type StoredPaymentForVerification = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type ProviderPaymentForVerification = {
  id: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  metadata?: Record<string, unknown> | null;
};

export type PaymentVerificationResult =
  | { verified: true; status: string }
  | { verified: false; status: string; reason: string };

function normalizeAmount(value: string | undefined): string {
  if (!value) return "";
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return value.trim();
  return parsed.toFixed(2);
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return value == null ? "" : String(value);
}

export function verifySucceededYookassaPayment(
  providerPayment: ProviderPaymentForVerification,
  storedPayment: StoredPaymentForVerification,
): PaymentVerificationResult {
  const status = providerPayment.status ?? "";
  if (providerPayment.id !== storedPayment.providerPaymentId) {
    return { verified: false, status, reason: "provider_payment_id_mismatch" };
  }
  if (status !== "succeeded") {
    return { verified: false, status, reason: "provider_status_not_succeeded" };
  }
  if (providerPayment.paid !== true) {
    return { verified: false, status, reason: "provider_payment_not_paid" };
  }
  if (normalizeAmount(providerPayment.amount?.value) !== normalizeAmount(storedPayment.amountRub)) {
    return { verified: false, status, reason: "amount_mismatch" };
  }
  if ((providerPayment.amount?.currency ?? "").toUpperCase() !== storedPayment.currency.toUpperCase()) {
    return { verified: false, status, reason: "currency_mismatch" };
  }

  const metadata = providerPayment.metadata;
  if (metadataString(metadata, "appPaymentId") !== storedPayment.appPaymentId) {
    return { verified: false, status, reason: "app_payment_id_mismatch" };
  }
  if (metadataString(metadata, "sessionId") !== storedPayment.sessionId) {
    return { verified: false, status, reason: "session_id_mismatch" };
  }
  if (metadataString(metadata, "packageCode") !== storedPayment.packageCode) {
    return { verified: false, status, reason: "package_code_mismatch" };
  }
  if (metadataString(metadata, "credits") !== String(storedPayment.creditsGranted)) {
    return { verified: false, status, reason: "credits_mismatch" };
  }

  return { verified: true, status };
}
