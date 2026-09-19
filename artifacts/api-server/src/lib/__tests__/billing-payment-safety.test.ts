import { describe, expect, it } from "vitest";
import { verifyYooKassaPaymentForCredit } from "../billing-payment-safety.js";

const localPayment = {
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
  amount: { value: "799.00", currency: "RUB" },
  metadata: {
    appPaymentId: "app_123",
    sessionId: "session_123",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifyYooKassaPaymentForCredit", () => {
  it("accepts a provider-settled payment that matches the local order", () => {
    expect(verifyYooKassaPaymentForCredit(localPayment, providerPayment)).toEqual({ ok: true });
  });

  it("rejects forged succeeded payloads when the provider has not marked the payment paid", () => {
    expect(
      verifyYooKassaPaymentForCredit(localPayment, {
        ...providerPayment,
        status: "pending",
        paid: false,
      }),
    ).toEqual({ ok: false, reason: "provider_not_paid" });
  });

  it("rejects paid provider records that do not belong to the local app payment", () => {
    expect(
      verifyYooKassaPaymentForCredit(localPayment, {
        ...providerPayment,
        metadata: {
          ...providerPayment.metadata,
          appPaymentId: "other_app_payment",
        },
      }),
    ).toEqual({ ok: false, reason: "app_payment_id_mismatch" });
  });

  it("rejects amount mismatches before credits can be applied", () => {
    expect(
      verifyYooKassaPaymentForCredit(localPayment, {
        ...providerPayment,
        amount: { value: "349.00", currency: "RUB" },
      }),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });
});
