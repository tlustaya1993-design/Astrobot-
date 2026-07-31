import { describe, expect, it } from "vitest";
import {
  verifySucceededYookassaPayment,
  type ProviderPaymentForVerification,
  type StoredPaymentForVerification,
} from "../billing-payment-safety.js";

const storedPayment: StoredPaymentForVerification = {
  providerPaymentId: "2f4f-pay",
  appPaymentId: "app-123",
  sessionId: "session-123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment: ProviderPaymentForVerification = {
  id: "2f4f-pay",
  status: "succeeded",
  paid: true,
  amount: { value: "799.00", currency: "RUB" },
  metadata: {
    appPaymentId: "app-123",
    sessionId: "session-123",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifySucceededYookassaPayment", () => {
  it("accepts a provider-confirmed paid payment that matches the stored row", () => {
    expect(verifySucceededYookassaPayment(providerPayment, storedPayment)).toEqual({
      verified: true,
      status: "succeeded",
    });
  });

  it("rejects forged succeeded webhook state when the provider payment is still pending", () => {
    expect(
      verifySucceededYookassaPayment(
        { ...providerPayment, status: "pending", paid: false },
        storedPayment,
      ),
    ).toEqual({
      verified: false,
      status: "pending",
      reason: "provider_status_not_succeeded",
    });
  });

  it("rejects succeeded provider payments whose metadata does not match the stored app payment", () => {
    expect(
      verifySucceededYookassaPayment(
        {
          ...providerPayment,
          metadata: { ...providerPayment.metadata, sessionId: "attacker-session" },
        },
        storedPayment,
      ),
    ).toEqual({
      verified: false,
      status: "succeeded",
      reason: "session_id_mismatch",
    });
  });
});
