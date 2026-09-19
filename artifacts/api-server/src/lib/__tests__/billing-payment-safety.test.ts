import { describe, expect, it } from "vitest";
import {
  verifyYookassaPaymentMatchesRecord,
  type PaymentSettlementRecord,
  type YooKassaSettlementPayment,
} from "../billing-payment-safety.js";

const paymentRecord: PaymentSettlementRecord = {
  providerPaymentId: "yk_123",
  appPaymentId: "app_123",
  sessionId: "session_123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

function providerPayment(overrides: Partial<YooKassaSettlementPayment> = {}): YooKassaSettlementPayment {
  return {
    id: "yk_123",
    status: "succeeded",
    paid: true,
    amount: { value: "799.00", currency: "RUB" },
    metadata: {
      appPaymentId: "app_123",
      sessionId: "session_123",
      packageCode: "pack30",
      credits: "30",
    },
    ...overrides,
  };
}

describe("verifyYookassaPaymentMatchesRecord", () => {
  it("accepts a settled provider payment that matches the stored record", () => {
    expect(verifyYookassaPaymentMatchesRecord(paymentRecord, providerPayment())).toEqual({ ok: true });
  });

  it("rejects forged local success when provider payment is not paid", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(
        paymentRecord,
        providerPayment({ status: "pending", paid: false }),
      ),
    ).toEqual({ ok: false, reason: "provider_payment_not_settled" });
  });

  it("rejects provider metadata that belongs to another app payment", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(
        paymentRecord,
        providerPayment({
          metadata: {
            appPaymentId: "other_app",
            sessionId: "session_123",
            packageCode: "pack30",
            credits: "30",
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "app_payment_id_mismatch" });
  });

  it("rejects a settled provider payment with a mismatched amount", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(
        paymentRecord,
        providerPayment({ amount: { value: "349.00", currency: "RUB" } }),
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });
});
