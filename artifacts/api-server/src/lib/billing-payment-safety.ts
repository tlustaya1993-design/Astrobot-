import type { YooKassaPaymentObject } from "./yookassa.js";

type PaymentForSettlement = {
  providerPaymentId: string;
  appPaymentId: string;
  sessionId: string;
  packageCode: string;
  creditsGranted: number;
  amountRub: string;
  currency: string;
};

type SettlementVerification = {
  ok: boolean;
  reason?: string;
  payment: YooKassaPaymentObject;
};

function amountToMinorUnits(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function metadataValue(
  metadata: Record<string, string> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

export function verifyYooKassaPaymentForSettlement(
  payment: PaymentForSettlement,
  providerPayment: YooKassaPaymentObject,
): SettlementVerification {
  if (providerPayment.id !== payment.providerPaymentId) {
    return { ok: false, reason: "provider_payment_id_mismatch", payment: providerPayment };
  }
  if (providerPayment.status !== "succeeded") {
    return { ok: false, reason: "provider_status_not_succeeded", payment: providerPayment };
  }
  if (providerPayment.paid !== true) {
    return { ok: false, reason: "provider_payment_not_paid", payment: providerPayment };
  }
  if (!providerPayment.amount) {
    return { ok: false, reason: "provider_amount_missing", payment: providerPayment };
  }
  if (providerPayment.amount.currency !== payment.currency) {
    return { ok: false, reason: "provider_currency_mismatch", payment: providerPayment };
  }
  if (amountToMinorUnits(providerPayment.amount.value) !== amountToMinorUnits(payment.amountRub)) {
    return { ok: false, reason: "provider_amount_mismatch", payment: providerPayment };
  }

  const metadata = providerPayment.metadata;
  if (metadataValue(metadata, "appPaymentId") !== payment.appPaymentId) {
    return { ok: false, reason: "provider_metadata_app_payment_id_mismatch", payment: providerPayment };
  }
  if (metadataValue(metadata, "sessionId") !== payment.sessionId) {
    return { ok: false, reason: "provider_metadata_session_id_mismatch", payment: providerPayment };
  }
  if (metadataValue(metadata, "packageCode") !== payment.packageCode) {
    return { ok: false, reason: "provider_metadata_package_code_mismatch", payment: providerPayment };
  }
  if (metadataValue(metadata, "credits") !== String(payment.creditsGranted)) {
    return { ok: false, reason: "provider_metadata_credits_mismatch", payment: providerPayment };
  }

  return { ok: true, payment: providerPayment };
}
