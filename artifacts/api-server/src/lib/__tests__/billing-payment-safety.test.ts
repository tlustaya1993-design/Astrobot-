import { describe, expect, it } from "vitest";
import { verifyYookassaPaymentMatchesRecord } from "../billing-payment-safety.js";

const payment = {
  providerPaymentId: "yk-pay-1",
  appPaymentId: "app-pay-1",
  sessionId: "session-1",
  packageCode: "pack30",
  creditsGranted: 30,
  amountRub: "799.00",
  currency: "RUB",
};

const providerPayment = {
  id: "yk-pay-1",
  status: "succeeded",
  paid: true,
  amount: {
    value: "799.00",
    currency: "RUB",
  },
  metadata: {
    appPaymentId: "app-pay-1",
    sessionId: "session-1",
    packageCode: "pack30",
    credits: "30",
  },
};

describe("verifyYookassaPaymentMatchesRecord", () => {
  it("accepts a paid YooKassa payment matching the stored record", () => {
    expect(verifyYookassaPaymentMatchesRecord(providerPayment, payment)).toEqual({ ok: true });
  });

  it("rejects a local succeeded status when YooKassa has not marked it paid", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(
        { ...providerPayment, paid: false },
        payment,
      ),
    ).toEqual({ ok: false, reason: "provider_payment_not_paid" });
  });

  it("rejects mismatched payment metadata", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(
        {
          ...providerPayment,
          metadata: { ...providerPayment.metadata, sessionId: "attacker-session" },
        },
        payment,
      ),
    ).toEqual({ ok: false, reason: "session_id_mismatch" });
  });

  it("rejects amount mismatches", () => {
    expect(
      verifyYookassaPaymentMatchesRecord(
        {
          ...providerPayment,
          amount: { value: "1.00", currency: "RUB" },
        },
        payment,
      ),
    ).toEqual({ ok: false, reason: "amount_mismatch" });
  });
});
