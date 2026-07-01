import { describe, expect, it } from "vitest";
import {
  verifyYookassaPaymentForCredit,
  type ProviderPaymentForVerification,
  type StoredPaymentForVerification,
} from "../billing-payment-safety.js";

const storedPayment: StoredPaymentForVerification = {
  id: 1,
  sessionId: "session-123",
  providerPaymentId: "yk-payment-123",
  appPaymentId: "app-payment-123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

function providerPayment(
  overrides: Partial<ProviderPaymentForVerification> = {},
): ProviderPaymentForVerification {
  return {
    id: "yk-payment-123",
    status: "succeeded",
    paid: true,
    amount: { value: "799.00", currency: "RUB" },
    metadata: {
      appPaymentId: "app-payment-123",
      sessionId: "session-123",
      packageCode: "pack30",
      credits: "30",
    },
    ...overrides,
  };
}

describe("verifyYookassaPaymentForCredit", () => {
  it("accepts a provider-confirmed paid payment that matches the DB row", () => {
    expect(
      verifyYookassaPaymentForCredit(storedPayment, providerPayment()),
    ).toEqual({ ok: true, status: "succeeded" });
  });

  it("rejects a forged succeeded webhook when provider state is not paid", () => {
    expect(
      verifyYookassaPaymentForCredit(
        storedPayment,
        providerPayment({ status: "pending", paid: false }),
      ),
    ).toEqual({
      ok: false,
      status: "pending",
      reason: "provider_status_not_succeeded",
    });
  });

  it("rejects provider amount mismatches", () => {
    expect(
      verifyYookassaPaymentForCredit(
        storedPayment,
        providerPayment({ amount: { value: "1.00", currency: "RUB" } }),
      ),
    ).toEqual({
      ok: false,
      status: "succeeded",
      reason: "amount_mismatch",
    });
  });

  it("rejects provider metadata mismatches", () => {
    expect(
      verifyYookassaPaymentForCredit(
        storedPayment,
        providerPayment({
          metadata: {
            appPaymentId: "app-payment-123",
            sessionId: "attacker-session",
            packageCode: "pack30",
            credits: "30",
          },
        }),
      ),
    ).toEqual({
      ok: false,
      status: "succeeded",
      reason: "session_id_mismatch",
    });
  });
});
