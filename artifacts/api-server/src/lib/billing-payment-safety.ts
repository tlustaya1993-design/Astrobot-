export type LocalYooKassaPayment = {
  providerPaymentId: string | null;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type ProviderYooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  amount?: {
    value: string;
    currency: string;
  };
  metadata?: Record<string, string | undefined>;
};

export type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function amountToMinorUnits(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function sameAmount(expected: string, actual: string | undefined): boolean {
  if (!actual) return false;
  const expectedMinor = amountToMinorUnits(expected);
  const actualMinor = amountToMinorUnits(actual);
  return expectedMinor !== null && actualMinor !== null && expectedMinor === actualMinor;
}

export function verifyYooKassaPaymentForCredit(
  local: LocalYooKassaPayment,
  provider: ProviderYooKassaPayment,
): PaymentVerificationResult {
  if (!local.providerPaymentId || provider.id !== local.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (provider.status !== "succeeded" || provider.paid !== true) {
    return { ok: false, reason: "provider_not_paid" };
  }
  if (!sameAmount(local.amountRub, provider.amount?.value)) {
    return { ok: false, reason: "amount_mismatch" };
  }
  if ((provider.amount?.currency ?? "").toUpperCase() !== local.currency.toUpperCase()) {
    return { ok: false, reason: "currency_mismatch" };
  }

  const metadata = provider.metadata ?? {};
  if (metadata.appPaymentId !== local.appPaymentId) {
    return { ok: false, reason: "app_payment_id_mismatch" };
  }
  if (metadata.sessionId !== local.sessionId) {
    return { ok: false, reason: "session_id_mismatch" };
  }
  if (metadata.packageCode !== local.packageCode) {
    return { ok: false, reason: "package_code_mismatch" };
  }
  if (metadata.credits !== String(local.creditsGranted)) {
    return { ok: false, reason: "credits_mismatch" };
  }

  return { ok: true };
}
