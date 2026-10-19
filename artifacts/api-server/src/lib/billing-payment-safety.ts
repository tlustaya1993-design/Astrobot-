export type PaymentSettlementRow = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type YooKassaPaymentForSettlement = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: {
    value?: string;
    currency?: string;
  } | null;
  metadata?: Record<string, unknown> | null;
};

export type SettlementVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function amountToKopecks(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Webhook bodies are not authenticated in this integration, so credit settlement
 * must be gated on the provider's own payment record, not caller-supplied JSON.
 */
export function verifyYooKassaPaymentForSettlement(
  payment: PaymentSettlementRow,
  providerPayment: YooKassaPaymentForSettlement | null | undefined,
): SettlementVerificationResult {
  if (!providerPayment) return { ok: false, reason: "provider_payment_missing" };
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_paid" };
  }

  const providerAmount = amountToKopecks(providerPayment.amount?.value);
  const expectedAmount = amountToKopecks(payment.amountRub);
  if (providerAmount == null || expectedAmount == null || providerAmount !== expectedAmount) {
    return { ok: false, reason: "amount_mismatch" };
  }

  const providerCurrency = providerPayment.amount?.currency?.toUpperCase() ?? "";
  if (providerCurrency !== payment.currency.toUpperCase()) {
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
