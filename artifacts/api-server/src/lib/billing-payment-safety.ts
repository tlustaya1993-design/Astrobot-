export type YooKassaPaymentForVerification = {
  id: string;
  status: string;
  paid: boolean;
  amount?: {
    value: string;
    currency: string;
  };
  metadata?: Record<string, unknown>;
};

type PaymentVerificationRow = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

export type YooKassaPaymentVerification =
  | { ok: true }
  | { ok: false; reason: string };

function amountToKopecks(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [rubles, kopecks = ""] = trimmed.split(".");
  return Number.parseInt(rubles, 10) * 100 + Number.parseInt(kopecks.padEnd(2, "0"), 10);
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (value == null) return null;
  return String(value);
}

/**
 * Verifies that a YooKassa payment object (fetched from the provider API)
 * matches our local payment row before credits may be granted.
 * Never trust webhook body alone — always pass a re-fetched provider payment.
 */
export function verifyYooKassaPaymentForCredits(
  payment: PaymentVerificationRow,
  providerPayment: YooKassaPaymentForVerification,
): YooKassaPaymentVerification {
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch" };
  }
  if (providerPayment.status !== "succeeded") {
    return { ok: false, reason: "provider_status_not_succeeded" };
  }
  if (providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_paid" };
  }

  const providerAmount = providerPayment.amount;
  if (!providerAmount) {
    return { ok: false, reason: "provider_amount_missing" };
  }
  if (providerAmount.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    return { ok: false, reason: "provider_currency_mismatch" };
  }

  const expectedKopecks = amountToKopecks(payment.amountRub);
  const actualKopecks = amountToKopecks(providerAmount.value);
  if (expectedKopecks == null || actualKopecks == null || expectedKopecks !== actualKopecks) {
    return { ok: false, reason: "provider_amount_mismatch" };
  }

  const metadata = providerPayment.metadata;
  const expectedMetadata: Record<string, string> = {
    appPaymentId: payment.appPaymentId,
    sessionId: payment.sessionId,
    packageCode: payment.packageCode,
    credits: String(payment.creditsGranted),
  };

  for (const [key, expected] of Object.entries(expectedMetadata)) {
    if (metadataString(metadata, key) !== expected) {
      return { ok: false, reason: `provider_metadata_${key}_mismatch` };
    }
  }

  return { ok: true };
}

/** Allowed hosts for payment returnUrl (open-redirect hardening). */
export function collectAllowedReturnHosts(extraHosts: string[] = []): Set<string> {
  const hosts = new Set<string>();
  const addOrigin = (raw: string | undefined | null) => {
    if (!raw?.trim()) return;
    try {
      const value = raw.trim();
      const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
      if (url.hostname) hosts.add(url.hostname.toLowerCase());
    } catch {
      /* ignore invalid */
    }
  };

  addOrigin(process.env.PUBLIC_ORIGIN);
  addOrigin(process.env.VITE_PUBLIC_ORIGIN);
  addOrigin(process.env.OAUTH_REDIRECT_BASE_URL);
  addOrigin(process.env.RAILWAY_PUBLIC_DOMAIN);
  addOrigin(process.env.URL);
  addOrigin(process.env.RENDER_EXTERNAL_URL);
  for (const h of extraHosts) addOrigin(h);

  return hosts;
}

export function isAllowedPaymentReturnUrl(
  returnUrl: string,
  opts: { extraHosts?: string[]; requireHttpsInProduction?: boolean } = {},
): boolean {
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (
    opts.requireHttpsInProduction !== false &&
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    return false;
  }

  const allowed = collectAllowedReturnHosts(opts.extraHosts);
  if (allowed.size === 0) {
    // No configured public origin: only allow loopback (dev) or reject in production.
    if (process.env.NODE_ENV === "production") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  }

  return allowed.has(url.hostname.toLowerCase());
}
