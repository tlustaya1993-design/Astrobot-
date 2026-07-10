export type PaymentSettlementRecord = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type YooKassaSettlementPayment = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  };
  metadata?: Record<string, unknown> | null;
};

export type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function toMinorUnits(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function metadataValue(metadata: Record<string, unknown> | null | undefined, key: string): string {
  const value = metadata?.[key];
  return value == null ? "" : String(value);
}

export function verifyYookassaPaymentMatchesRecord(
  record: PaymentSettlementRecord,
  providerPayment: YooKassaSettlementPayment,
): PaymentVerificationResult {
  if (providerPayment.id !== record.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_settled" };
  }
  if (toMinorUnits(providerPayment.amount?.value) !== toMinorUnits(record.amountRub)) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if ((providerPayment.amount?.currency ?? "").toUpperCase() !== record.currency.toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
  }

  const metadata = providerPayment.metadata;
  if (metadataValue(metadata, "appPaymentId") !== record.appPaymentId) {
    return { ok: false, reason: "app_payment_id_mismatch" };
  }
  if (metadataValue(metadata, "sessionId") !== record.sessionId) {
    return { ok: false, reason: "session_id_mismatch" };
  }
  if (metadataValue(metadata, "packageCode") !== record.packageCode) {
    return { ok: false, reason: "package_code_mismatch" };
  }
  if (metadataValue(metadata, "credits") !== String(record.creditsGranted)) {
    return { ok: false, reason: "credits_mismatch" };
  }

  return { ok: true };
}
