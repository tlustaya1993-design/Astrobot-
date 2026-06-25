import { describe, expect, it } from "vitest";
import { verifyYookassaPaymentForCredit } from "../billing-payment-safety.js";

const storedPayment = {
  providerPaymentId: "2f9d-pay",
  appPaymentId: "app-123",
  sessionId: "session-123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment = {
  id: "2f9d-pay",
  status: "succeeded",
  paid: true,
  amount: {
    value: "799.00",
    currency: "RUB",
  },
  metadata: {
    appPaymentId: "app-123",
    sessionId: "session-123",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifyYookassaPaymentForCredit", () => {
  it("accepts a paid provider payment that matches the stored row", () => {
    expect(verifyYookassaPaymentForCredit(storedPayment, providerPayment)).toEqual({ ok: true });
  });

  it("rejects an unpaid provider payment even if the webhook body claimed success", () => {
    expect(
      verifyYookassaPaymentForCredit(storedPayment, {
        ...providerPayment,
        status: "pending",
        paid: false,
      }),
    ).toEqual({ ok: false, reason: "provider_payment_not_paid" });
  });

  it("rejects a provider payment whose metadata does not match the local payment", () => {
    expect(
      verifyYookassaPaymentForCredit(storedPayment, {
        ...providerPayment,
        metadata: {
          ...providerPayment.metadata,
          sessionId: "attacker-session",
        },
      }),
    ).toEqual({ ok: false, reason: "session_id_mismatch" });
  });

  it("rejects amount mismatches before credits can be applied", () => {
    expect(
      verifyYookassaPaymentForCredit(storedPayment, {
        ...providerPayment,
        amount: {
          value: "349.00",
          currency: "RUB",
        },
      }),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });
});
