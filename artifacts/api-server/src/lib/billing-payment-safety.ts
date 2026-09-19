export type LocalPaymentForVerification = {
  providerPaymentId: string | null;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type YooKassaPaymentForVerification = {
  id: string;
  status: string;
  paid: boolean;
  amount?: {
    value: string;
    currency: string;
  };
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function normalizeMoneyToMinorUnits(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function metadataValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function verifyYooKassaPaymentIdentity(
  local: LocalPaymentForVerification,
  provider: YooKassaPaymentForVerification,
): PaymentVerificationResult {
  if (!local.providerPaymentId || provider.id !== local.providerPaymentId) {
    return { ok: false, reason: "provider_id_mismatch" };
  }

  const localAmount = normalizeMoneyToMinorUnits(local.amountRub);
  const providerAmount = normalizeMoneyToMinorUnits(provider.amount?.value);
  if (localAmount === null || providerAmount === null || localAmount !== providerAmount) {
    return { ok: false, reason: "amount_mismatch" };
  }

  if ((provider.amount?.currency ?? "").toUpperCase() !== local.currency.toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
  }

  const metadata = provider.metadata ?? {};
  if (metadataValue(metadata.appPaymentId) !== local.appPaymentId) {
    return { ok: false, reason: "app_payment_id_mismatch" };
  }
  if (metadataValue(metadata.sessionId) !== local.sessionId) {
    return { ok: false, reason: "session_id_mismatch" };
  }
  if (metadataValue(metadata.packageCode) !== local.packageCode) {
    return { ok: false, reason: "package_code_mismatch" };
  }
  if (metadataValue(metadata.credits) !== String(local.creditsGranted)) {
    return { ok: false, reason: "credits_mismatch" };
  }

  return { ok: true };
}

export function verifyYooKassaPaymentSettled(
  local: LocalPaymentForVerification,
  provider: YooKassaPaymentForVerification,
): PaymentVerificationResult {
  const identity = verifyYooKassaPaymentIdentity(local, provider);
  if (!identity.ok) return identity;
  if (provider.status !== "succeeded" || provider.paid !== true) {
    return { ok: false, reason: "payment_not_settled" };
  }
  return { ok: true };
}
