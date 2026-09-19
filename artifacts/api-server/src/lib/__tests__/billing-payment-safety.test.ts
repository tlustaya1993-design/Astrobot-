import { describe, expect, it } from "vitest";
import { verifyYookassaPaymentMatchesRecord } from "../billing-payment-safety.js";

const payment = {
  providerPaymentId: "yk-payment-1",
  appPaymentId: "app-payment-1",
  sessionId: "session-1",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment = {
  id: "yk-payment-1",
  status: "succeeded",
  paid: true,
  amount: {
    value: "799.00",
    currency: "RUB",
  },
  metadata: {
    appPaymentId: "app-payment-1",
    sessionId: "session-1",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifyYookassaPaymentMatchesRecord", () => {
  it("accepts a succeeded provider payment that matches the stored record", () => {
    expect(verifyYookassaPaymentMatchesRecord(payment, providerPayment)).toEqual({ ok: true });
  });

  it("rejects a local success webhook when YooKassa has not marked the payment paid", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(payment, {
        ...providerPayment,
        status: "pending",
        paid: false,
      }),
    ).toEqual({ ok: false, reason: "provider_payment_not_succeeded" });
  });

  it("rejects successful provider payments with mismatched metadata", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(payment, {
        ...providerPayment,
        metadata: {
          ...providerPayment.metadata,
          sessionId: "attacker-session",
        },
      }),
    ).toEqual({ ok: false, reason: "session_id_mismatch" });
  });

  it("rejects successful provider payments with mismatched amount", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(payment, {
        ...providerPayment,
        amount: {
          value: "349.00",
          currency: "RUB",
        },
      }),
    ).toEqual({ ok: false, reason: "amount_or_currency_mismatch" });
  });
});
