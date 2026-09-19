import { describe, expect, it } from "vitest";
import {
  verifyYooKassaPaymentIdentity,
  verifyYooKassaPaymentSettled,
  type LocalPaymentForVerification,
  type YooKassaPaymentForVerification,
} from "../billing-payment-safety.js";

const localPayment: LocalPaymentForVerification = {
  providerPaymentId: "yk_payment_1",
  appPaymentId: "app-payment-1",
  sessionId: "session-1",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerMetadata = {
  appPaymentId: "app-payment-1",
  sessionId: "session-1",
  packageCode: "pack30",
  credits: "30",
};

function providerPayment(
  overrides: Partial<YooKassaPaymentForVerification> = {},
): YooKassaPaymentForVerification {
  return {
    id: "yk_payment_1",
    status: "succeeded",
    paid: true,
    amount: { value: "799.00", currency: "RUB" },
    metadata: providerMetadata,
    ...overrides,
  };
}

describe("verifyYooKassaPaymentSettled", () => {
  it("accepts a paid succeeded provider payment matching the local row", () => {
    expect(verifyYooKassaPaymentSettled(localPayment, providerPayment())).toEqual({ ok: true });
  });

  it("rejects a forged succeeded notification when YooKassa has not settled the payment", () => {
    expect(
      verifyYooKassaPaymentSettled(
        localPayment,
        providerPayment({ status: "pending", paid: false }),
      ),
    ).toEqual({ ok: false, reason: "payment_not_settled" });
  });

  it("rejects provider payments with mismatched amount or metadata", () => {
    expect(
      verifyYooKassaPaymentSettled(
        localPayment,
        providerPayment({ amount: { value: "349.00", currency: "RUB" } }),
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });

    expect(
      verifyYooKassaPaymentSettled(
        localPayment,
        providerPayment({ metadata: { ...providerMetadata, sessionId: "other-session" } }),
      ),
    ).toEqual({ ok: false, reason: "session_id_mismatch" });
  });
});

describe("verifyYooKassaPaymentIdentity", () => {
  it("allows status sync for matching non-settled provider rows without considering them paid", () => {
    expect(
      verifyYooKassaPaymentIdentity(
        localPayment,
        providerPayment({ status: "canceled", paid: false }),
      ),
    ).toEqual({ ok: true });
  });
});
