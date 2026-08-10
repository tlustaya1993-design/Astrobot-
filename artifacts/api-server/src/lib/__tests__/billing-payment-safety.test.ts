import { describe, expect, it } from "vitest";
import {
  verifyYooKassaPaymentForCredits,
  type YooKassaPaymentForVerification,
} from "../billing-payment-safety.js";

const paymentRow = {
  providerPaymentId: "2f5f0000-000f-5000-9000-100000000001",
  appPaymentId: "app-payment-1",
  sessionId: "session-1",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

function providerPayment(
  overrides: Partial<YooKassaPaymentForVerification> = {},
): YooKassaPaymentForVerification {
  return {
    id: paymentRow.providerPaymentId,
    status: "succeeded",
    paid: true,
    amount: {
      value: "799.00",
      currency: "RUB",
    },
    metadata: {
      appPaymentId: paymentRow.appPaymentId,
      sessionId: paymentRow.sessionId,
      packageCode: paymentRow.packageCode,
      credits: String(paymentRow.creditsGranted),
    },
    ...overrides,
  };
}

describe("verifyYooKassaPaymentForCredits", () => {
  it("accepts paid succeeded provider payments that match the local payment row", () => {
    expect(verifyYooKassaPaymentForCredits(paymentRow, providerPayment())).toEqual({ ok: true });
  });

  it("rejects forged succeeded payloads when the provider payment is not paid", () => {
    expect(
      verifyYooKassaPaymentForCredits(
        paymentRow,
        providerPayment({
          paid: false,
        }),
      ),
    ).toEqual({ ok: false, reason: "provider_payment_not_paid" });
  });

  it("rejects succeeded provider payments with mismatched amount or metadata", () => {
    expect(
      verifyYooKassaPaymentForCredits(
        paymentRow,
        providerPayment({
          amount: {
            value: "349.00",
            currency: "RUB",
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "provider_amount_mismatch" });

    expect(
      verifyYooKassaPaymentForCredits(
        paymentRow,
        providerPayment({
          metadata: {
            appPaymentId: paymentRow.appPaymentId,
            sessionId: "attacker-session",
            packageCode: paymentRow.packageCode,
            credits: String(paymentRow.creditsGranted),
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "provider_metadata_sessionId_mismatch" });
  });
});
