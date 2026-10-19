import { describe, expect, it } from "vitest";
import { verifyYooKassaPaymentForSettlement } from "../billing-payment-safety.js";

const payment = {
  providerPaymentId: "yk_payment_1",
  appPaymentId: "app_payment_1",
  sessionId: "session_1",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment = {
  id: "yk_payment_1",
  status: "succeeded",
  paid: true,
  amount: {
    value: "799.00",
    currency: "RUB",
  },
  metadata: {
    appPaymentId: "app_payment_1",
    sessionId: "session_1",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifyYooKassaPaymentForSettlement", () => {
  it("accepts a paid provider payment that matches the local row", () => {
    expect(verifyYooKassaPaymentForSettlement(payment, providerPayment)).toEqual({
      ok: true,
      status: "succeeded",
    });
  });

  it("rejects caller-supplied succeeded status when YooKassa has not marked it paid", () => {
    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        paid: false,
      }),
    ).toMatchObject({
      ok: false,
      reason: "provider_not_paid",
    });
  });

  it("rejects succeeded payments whose amount or metadata does not match the DB row", () => {
    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        amount: { value: "349.00", currency: "RUB" },
      }),
    ).toMatchObject({
      ok: false,
      reason: "amount_mismatch",
    });

    expect(
      verifyYooKassaPaymentForSettlement(payment, {
        ...providerPayment,
        metadata: {
          ...providerPayment.metadata,
          sessionId: "other_session",
        },
      }),
    ).toMatchObject({
      ok: false,
      reason: "metadata_mismatch",
    });
  });
});
