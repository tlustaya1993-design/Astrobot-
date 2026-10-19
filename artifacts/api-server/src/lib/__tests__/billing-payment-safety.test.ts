import { describe, expect, it } from "vitest";
import {
  selectReceiptEmailForYooKassa,
  verifyYooKassaSucceededPayment,
  type PaymentTrustRow,
  type YooKassaProviderPaymentForTrust,
} from "../billing-payment-safety.js";

const row: PaymentTrustRow = {
  providerPaymentId: "2f2d9f1a-000f-5000-9000-18f80bb21f42",
  appPaymentId: "app-payment-id",
  sessionId: "session-id",
  packageCode: "pack10",
  creditsGranted: 10,
  amountRub: "349.00",
  currency: "RUB",
};

function providerPayment(
  overrides: Partial<YooKassaProviderPaymentForTrust> = {},
): YooKassaProviderPaymentForTrust {
  return {
    id: row.providerPaymentId,
    status: "succeeded",
    paid: true,
    amount: {
      value: row.amountRub,
      currency: row.currency,
    },
    metadata: {
      appPaymentId: row.appPaymentId,
      sessionId: row.sessionId,
      packageCode: row.packageCode,
      credits: String(row.creditsGranted),
    },
    ...overrides,
  };
}

describe("selectReceiptEmailForYooKassa", () => {
  it("uses a verified auth email for YooKassa without requiring a user-row email", () => {
    expect(
      selectReceiptEmailForYooKassa({
        userEmail: null,
        authEmail: "User@Example.COM ",
        receiptEmail: "receipt@example.com",
      }),
    ).toEqual({ email: "user@example.com", source: "auth" });
  });

  it("keeps caller-supplied receipt email separate from account identity", () => {
    expect(
      selectReceiptEmailForYooKassa({
        userEmail: null,
        authEmail: null,
        receiptEmail: "admin@example.com",
      }),
    ).toEqual({ email: "admin@example.com", source: "body" });
  });
});

describe("verifyYooKassaSucceededPayment", () => {
  it("trusts a paid provider success only when amount and metadata match the local row", () => {
    expect(verifyYooKassaSucceededPayment(row, providerPayment())).toEqual({ ok: true });
  });

  it("rejects a forged success when YooKassa still reports the payment pending", () => {
    expect(
      verifyYooKassaSucceededPayment(row, providerPayment({ status: "pending", paid: false })),
    ).toEqual({ ok: false, reason: "provider_status_not_succeeded" });
  });

  it("rejects paid successes whose provider metadata belongs to a different session", () => {
    expect(
      verifyYooKassaSucceededPayment(
        row,
        providerPayment({
          metadata: {
            appPaymentId: row.appPaymentId,
            sessionId: "attacker-session",
            packageCode: row.packageCode,
            credits: String(row.creditsGranted),
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "provider_session_id_mismatch" });
  });

  it("rejects paid successes with a different provider amount", () => {
    expect(
      verifyYooKassaSucceededPayment(
        row,
        providerPayment({
          amount: {
            value: "1.00",
            currency: "RUB",
          },
        }),
      ),
    ).toEqual({ ok: false, reason: "provider_amount_mismatch" });
  });
});
