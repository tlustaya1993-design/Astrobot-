import { describe, expect, it } from "vitest";
import { verifyProviderPaymentMatchesRow } from "../billing.js";

const paymentRow = {
  providerPaymentId: "2f3f2d45-verified-provider-id",
  appPaymentId: "app-payment-id",
  sessionId: "session-123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment = {
  id: paymentRow.providerPaymentId,
  status: "succeeded",
  paid: true,
  amount: {
    value: paymentRow.amountRub,
    currency: paymentRow.currency,
  },
  metadata: {
    appPaymentId: paymentRow.appPaymentId,
    sessionId: paymentRow.sessionId,
    packageCode: paymentRow.packageCode,
    credits: String(paymentRow.creditsGranted),
  },
};

describe("verifyProviderPaymentMatchesRow", () => {
  it("accepts a YooKassa payment that matches the stored payment row", () => {
    expect(verifyProviderPaymentMatchesRow(providerPayment, paymentRow)).toEqual({ ok: true });
  });

  it("rejects a forged succeeded webhook when provider has not marked the payment paid", () => {
    expect(
      verifyProviderPaymentMatchesRow(
        {
          ...providerPayment,
          paid: false,
        },
        paymentRow,
      ),
    ).toEqual({ ok: false, reason: "succeeded_payment_not_marked_paid" });
  });

  it("rejects payments whose amount does not match the package purchased", () => {
    expect(
      verifyProviderPaymentMatchesRow(
        {
          ...providerPayment,
          amount: {
            value: "1.00",
            currency: paymentRow.currency,
          },
        },
        paymentRow,
      ),
    ).toEqual({ ok: false, reason: "amount_or_currency_mismatch" });
  });

  it("rejects payments whose metadata points at another session", () => {
    expect(
      verifyProviderPaymentMatchesRow(
        {
          ...providerPayment,
          metadata: {
            ...providerPayment.metadata,
            sessionId: "attacker-session",
          },
        },
        paymentRow,
      ),
    ).toEqual({ ok: false, reason: "session_id_mismatch" });
  });
});
