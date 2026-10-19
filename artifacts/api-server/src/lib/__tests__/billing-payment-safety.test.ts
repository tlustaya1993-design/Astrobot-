import { describe, expect, it } from "vitest";
import { verifyYooKassaPaymentForCredits } from "../billing-payment-safety.js";

const storedPayment = {
  providerPaymentId: "yk_123",
  appPaymentId: "app_123",
  sessionId: "session_123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment = {
  id: "yk_123",
  status: "succeeded",
  paid: true,
  amount: {
    value: "799.00",
    currency: "RUB",
  },
  metadata: {
    appPaymentId: "app_123",
    sessionId: "session_123",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifyYooKassaPaymentForCredits", () => {
  it("accepts a paid provider payment that matches the stored row", () => {
    expect(verifyYooKassaPaymentForCredits(storedPayment, providerPayment)).toEqual({
      ok: true,
      status: "succeeded",
    });
  });

  it("rejects a forged succeeded webhook when the provider payment is not paid", () => {
    expect(
      verifyYooKassaPaymentForCredits(storedPayment, {
        ...providerPayment,
        status: "pending",
        paid: false,
      }),
    ).toEqual({
      ok: false,
      status: "pending",
      reason: "provider_payment_not_succeeded",
    });
  });

  it("rejects a succeeded provider payment for a different amount", () => {
    expect(
      verifyYooKassaPaymentForCredits(storedPayment, {
        ...providerPayment,
        amount: { value: "1.00", currency: "RUB" },
      }),
    ).toEqual({
      ok: false,
      status: "succeeded",
      reason: "amount_mismatch",
    });
  });

  it("rejects a paid provider payment whose metadata points at another app payment", () => {
    expect(
      verifyYooKassaPaymentForCredits(storedPayment, {
        ...providerPayment,
        metadata: { ...providerPayment.metadata, appPaymentId: "other_app_payment" },
      }),
    ).toEqual({
      ok: false,
      status: "succeeded",
      reason: "app_payment_id_mismatch",
    });
  });
});
