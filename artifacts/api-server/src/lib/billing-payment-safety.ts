import type { Payment } from "@workspace/db";
import type { YooKassaPaymentObject } from "./yookassa.js";

type PaymentForVerification = Pick<
  Payment,
  | "providerPaymentId"
  | "appPaymentId"
  | "sessionId"
  | "packageCode"
  | "creditsGranted"
  | "amountRub"
  | "currency"
>;

export type PaymentVerificationResult =
  | { ok: true }
  | { ok: false; reason: string };

function toMinorUnits(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function fail(reason: string): PaymentVerificationResult {
  return { ok: false, reason };
}

export function verifyYookassaPaymentForCredit(
  stored: PaymentForVerification,
  providerPayment: YooKassaPaymentObject,
): PaymentVerificationResult {
  if (providerPayment.id !== stored.providerPaymentId) {
    return fail("provider_payment_id_mismatch");
  }
  if (providerPayment.status !== "succeeded" || providerPayment.paid !== true) {
    return fail("provider_payment_not_paid");
  }

  const expectedAmount = toMinorUnits(stored.amountRub);
  const actualAmount = toMinorUnits(providerPayment.amount?.value);
  if (expectedAmount == null || actualAmount == null || expectedAmount !== actualAmount) {
    return fail("amount_mismatch");
  }

  const expectedCurrency = stored.currency.trim().toUpperCase();
  const actualCurrency = providerPayment.amount?.currency?.trim().toUpperCase();
  if (!actualCurrency || actualCurrency !== expectedCurrency) {
    return fail("currency_mismatch");
  }

  const metadata = providerPayment.metadata ?? {};
  if (metadata.appPaymentId !== stored.appPaymentId) {
    return fail("app_payment_id_mismatch");
  }
  if (metadata.sessionId !== stored.sessionId) {
    return fail("session_id_mismatch");
  }
  if (metadata.packageCode !== stored.packageCode) {
    return fail("package_code_mismatch");
  }
  if (metadata.credits !== String(stored.creditsGranted)) {
    return fail("credits_mismatch");
  }

  return { ok: true };
}
