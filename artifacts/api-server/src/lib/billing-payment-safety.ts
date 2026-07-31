export const DEFAULT_RECEIPT_EMAIL = "billing@astrobot.app";

export type ReceiptEmailSource = "user" | "auth" | "body";

export type ReceiptEmailSelection = {
  email: string;
  source: ReceiptEmailSource;
};

export type PaymentTrustRow = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type YooKassaProviderPaymentForTrust = {
  id: string;
  status?: string;
  paid?: boolean;
  metadata?: Record<string, string> | null;
  amount?: {
    value?: string;
    currency?: string;
  } | null;
};

export type PaymentTrustResult =
  | { ok: true }
  | { ok: false; reason: string };

export function normalizeReceiptEmail(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return DEFAULT_RECEIPT_EMAIL;
  const email = value.trim().toLowerCase();
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return DEFAULT_RECEIPT_EMAIL;
  }
  return email;
}

export function isValidReceiptEmailForGuest(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim().toLowerCase();
  if (email.length < 5 || !email.includes("@")) return false;
  if (email.startsWith("@") || email.endsWith("@")) return false;
  return normalizeReceiptEmail(email) !== DEFAULT_RECEIPT_EMAIL;
}

export function selectReceiptEmailForYooKassa(args: {
  userEmail?: string | null;
  authEmail?: string | null;
  receiptEmail?: unknown;
}): ReceiptEmailSelection | null {
  if (args.userEmail?.trim() && isValidReceiptEmailForGuest(args.userEmail)) {
    return { email: normalizeReceiptEmail(args.userEmail), source: "user" };
  }
  if (args.authEmail?.trim() && isValidReceiptEmailForGuest(args.authEmail)) {
    return { email: normalizeReceiptEmail(args.authEmail), source: "auth" };
  }
  if (isValidReceiptEmailForGuest(args.receiptEmail)) {
    return { email: normalizeReceiptEmail(args.receiptEmail), source: "body" };
  }
  return null;
}

function toKopecks(amountRub: string | undefined): number | null {
  if (!amountRub) return null;
  const parsed = Number.parseFloat(amountRub);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

export function verifyYooKassaSucceededPayment(
  row: PaymentTrustRow,
  providerPayment: YooKassaProviderPaymentForTrust,
): PaymentTrustResult {
  if (providerPayment.id !== row.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded") {
    return { ok: false, reason: "provider_status_not_succeeded" };
  }
  if (providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_paid" };
  }

  const expectedAmount = toKopecks(row.amountRub);
  const providerAmount = toKopecks(providerPayment.amount?.value);
  if (expectedAmount == null || providerAmount == null || expectedAmount !== providerAmount) {
    return { ok: false, reason: "provider_amount_mismatch" };
  }
  if ((providerPayment.amount?.currency ?? "").toUpperCase() !== row.currency.toUpperCase()) {
    return { ok: false, reason: "provider_currency_mismatch" };
  }

  const metadata = providerPayment.metadata;
  if (!metadata) {
    return { ok: false, reason: "provider_metadata_missing" };
  }
  if (metadata.appPaymentId !== row.appPaymentId) {
    return { ok: false, reason: "provider_app_payment_id_mismatch" };
  }
  if (metadata.sessionId !== row.sessionId) {
    return { ok: false, reason: "provider_session_id_mismatch" };
  }
  if (metadata.packageCode !== row.packageCode) {
    return { ok: false, reason: "provider_package_code_mismatch" };
  }
  if (metadata.credits !== String(row.creditsGranted)) {
    return { ok: false, reason: "provider_credits_mismatch" };
  }

  return { ok: true };
}
