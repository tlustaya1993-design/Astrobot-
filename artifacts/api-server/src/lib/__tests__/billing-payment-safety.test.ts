import { describe, expect, it } from "vitest";
import {
  verifyYooKassaPaymentForCredits,
  type YooKassaPaymentForVerification,
} from "../billing-payment-safety.js";

const payment = {
  providerPaymentId: "yk_123",
  appPaymentId: "app_123",
  sessionId: "session_123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment: YooKassaPaymentForVerification = {
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

describe("verifyYooKassaPaymentForCredits", () => {
  it("accepts a paid succeeded provider payment that matches the DB row", () => {
    expect(verifyYooKassaPaymentForCredits(providerPayment, payment)).toEqual({ ok: true });
  });

  it("rejects a forged success payload that is not paid at the provider", () => {
    expect(
      verifyYooKassaPaymentForCredits(
        {
          ...providerPayment,
          paid: false,
        },
        payment,
      ),
    ).toEqual({ ok: false, reason: "provider_payment_not_paid" });
  });

  it("rejects succeeded provider payments whose metadata does not match the row", () => {
    expect(
      verifyYooKassaPaymentForCredits(
        {
          ...providerPayment,
          metadata: {
            ...(providerPayment.metadata ?? {}),
            sessionId: "other_session",
          },
        },
        payment,
      ),
    ).toEqual({ ok: false, reason: "session_id_mismatch" });
  });

  it("rejects succeeded provider payments with a mismatched amount", () => {
    expect(
      verifyYooKassaPaymentForCredits(
        {
          ...providerPayment,
          amount: { value: "1.00", currency: "RUB" },
        },
        payment,
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });
});
