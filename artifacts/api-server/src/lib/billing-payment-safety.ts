type StoredPaymentForVerification = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type YooKassaPaymentForVerification = {
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
  | { ok: true; status: string }
  | { ok: false; status: string; reason: string };

function amountToMinorUnits(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [rubles, kopecks = ""] = normalized.split(".");
  return Number.parseInt(rubles, 10) * 100 + Number.parseInt(kopecks.padEnd(2, "0"), 10);
}

function sameAmount(left: string | undefined, right: string): boolean {
  if (!left) return false;
  const leftMinor = amountToMinorUnits(left);
  const rightMinor = amountToMinorUnits(right);
  return leftMinor !== null && rightMinor !== null && leftMinor === rightMinor;
}

function metadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/**
 * YooKassa webhooks are not a trusted source of payment truth in this app.
 * Credits are granted only after the provider API confirms the stored payment.
 */
export function verifyYooKassaPaymentForCredits(
  stored: StoredPaymentForVerification,
  provider: YooKassaPaymentForVerification | null | undefined,
): PaymentVerificationResult {
  const status = provider?.status ?? "unknown";

  if (!provider) return { ok: false, status, reason: "missing_provider_payment" };
  if (provider.id !== stored.providerPaymentId) {
    return { ok: false, status, reason: "provider_payment_id_mismatch" };
  }
  if (provider.status !== "succeeded") {
    return { ok: false, status, reason: "provider_payment_not_succeeded" };
  }
  if (provider.paid !== true) {
    return { ok: false, status, reason: "provider_payment_not_paid" };
  }
  if (!sameAmount(provider.amount?.value, stored.amountRub)) {
    return { ok: false, status, reason: "amount_mismatch" };
  }
  if ((provider.amount?.currency ?? "").toUpperCase() !== stored.currency.toUpperCase()) {
    return { ok: false, status, reason: "currency_mismatch" };
  }
  if (metadataString(provider.metadata, "appPaymentId") !== stored.appPaymentId) {
    return { ok: false, status, reason: "app_payment_id_mismatch" };
  }
  if (metadataString(provider.metadata, "sessionId") !== stored.sessionId) {
    return { ok: false, status, reason: "session_id_mismatch" };
  }
  if (metadataString(provider.metadata, "packageCode") !== stored.packageCode) {
    return { ok: false, status, reason: "package_code_mismatch" };
  }
  if (metadataString(provider.metadata, "credits") !== String(stored.creditsGranted)) {
    return { ok: false, status, reason: "credits_mismatch" };
  }

  return { ok: true, status: provider.status };
}
