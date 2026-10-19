import { describe, expect, it } from "vitest";
import {
  verifyYooKassaPaymentForSettlement,
  type PaymentSettlementRow,
  type YooKassaPaymentForSettlement,
} from "../billing-payment-safety.js";

const payment: PaymentSettlementRow = {
  providerPaymentId: "yk_pay_123",
  appPaymentId: "app-pay-123",
  sessionId: "session-123",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment: YooKassaPaymentForSettlement = {
  id: "yk_pay_123",
  status: "succeeded",
  paid: true,
  amount: {
    value: "799.00",
    currency: "RUB",
  },
  metadata: {
    appPaymentId: "app-pay-123",
    sessionId: "session-123",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifyYooKassaPaymentForSettlement", () => {
  it("accepts a paid provider payment that matches the local payment row", () => {
    expect(verifyYooKassaPaymentForSettlement(payment, providerPayment)).toEqual({ ok: true });
  });

  it("rejects caller-supplied succeeded status when provider has not marked payment paid", () => {
    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        status: "pending",
        paid: false,
      }),
    ).toEqual({ ok: false, reason: "provider_payment_not_paid" });
  });

  it("rejects mismatched amount, currency, metadata, and provider id", () => {
    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        id: "other-payment",
      }),
    ).toEqual({ ok: false, reason: "provider_payment_id_mismatch" });

    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        amount: { value: "349.00", currency: "RUB" },
      }),
    ).toEqual({ ok: false, reason: "amount_mismatch" });

    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        amount: { value: "799.00", currency: "USD" },
      }),
    ).toEqual({ ok: false, reason: "currency_mismatch" });

    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        metadata: { ...(providerPayment.metadata ?? {}), sessionId: "attacker-session" },
      }),
    ).toEqual({ ok: false, reason: "session_id_mismatch" });
  });
});
