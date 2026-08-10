import { describe, expect, it } from "vitest";
import { verifyYooKassaPaymentForSettlement } from "../billing-payment-safety.js";

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

describe("verifyYooKassaPaymentForSettlement", () => {
  it("accepts a provider-paid payment matching the local row", () => {
    expect(verifyYooKassaPaymentForSettlement(localPayment, providerPayment)).toEqual({
      ok: true,
      payment: providerPayment,
    });
  });

  it("rejects a forged succeeded webhook when the provider payment is still pending", () => {
    const result = verifyYooKassaPaymentForSettlement(localPayment, {
      ...providerPayment,
      status: "pending",
      paid: false,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("provider_status_not_succeeded");
  });

  it("rejects provider payments with mismatched amount or metadata", () => {
    expect(
      verifyYooKassaPaymentForSettlement(localPayment, {
        ...providerPayment,
        amount: { value: "349.00", currency: "RUB" },
      }),
    ).toMatchObject({ ok: false, reason: "provider_amount_mismatch" });

    expect(
      verifyYooKassaPaymentForSettlement(localPayment, {
        ...providerPayment,
        metadata: { ...providerPayment.metadata, sessionId: "attacker_session" },
      }),
    ).toMatchObject({ ok: false, reason: "provider_metadata_session_id_mismatch" });
  });
});
