import express from "express";
import type { AddressInfo } from "net";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  transactionCalls: 0,
  paymentRow: {
    id: 1,
    providerPaymentId: "2f3f2d45-verified-provider-id",
    appPaymentId: "app-payment-id",
    sessionId: "session-123",
    packageCode: "pack30",
    creditsGranted: 30,
    amountRub: "799.00",
    currency: "RUB",
    status: "pending",
    creditsAppliedAt: null,
  },
  providerPayment: {
    id: "2f3f2d45-verified-provider-id",
    status: "succeeded",
    paid: true,
    amount: {
      value: "799.00",
      currency: "RUB",
    },
    metadata: {
      appPaymentId: "app-payment-id",
      sessionId: "session-123",
      packageCode: "pack30",
      credits: "30",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (left: unknown, right: unknown) => ({ op: "eq", left, right }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: (_target, prop) => ({ column: String(prop) }) });
  return {
    paymentsTable: table,
    usersTable: table,
    db: {
      select: () => ({
        from: () => ({
          limit: async () => [{ id: mockState.paymentRow.id }],
          where: () => ({
            limit: async () => [mockState.paymentRow],
          }),
          orderBy: () => ({
            limit: async () => [mockState.paymentRow],
          }),
        }),
      }),
      update: () => ({
        set: (value: Record<string, unknown>) => {
          mockState.updates.push(value);
          return {
            where: async () => [],
          };
        },
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [mockState.paymentRow],
        }),
      }),
      transaction: async () => {
        mockState.transactionCalls += 1;
        return 0;
      },
    },
  };
});

vi.mock("../../lib/yookassa.js", () => {
  class MockYooKassaError extends Error {
    kind = "http";
    operation = "create_payment";
  }

  return {
    createYookassaPayment: vi.fn(),
    getYookassaPayment: vi.fn(async () => mockState.providerPayment),
    parseYookassaNotification: (body: unknown) => {
      const event = body as { object?: { id?: string; status?: string } };
      if (!event?.object?.id || !event.object.status) {
        throw new Error("Invalid webhook payload");
      }
      return event;
    },
    YooKassaError: MockYooKassaError,
    validateYookassaWebhook: vi.fn(() => true),
  };
});

const { default: billingRouter, verifyProviderPaymentMatchesRow } = await import("../billing.js");

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

beforeEach(() => {
  mockState.updates = [];
  mockState.transactionCalls = 0;
  mockState.paymentRow = {
    ...mockState.paymentRow,
    status: "pending",
    creditsAppliedAt: null,
  };
  mockState.providerPayment = {
    ...providerPayment,
    metadata: { ...providerPayment.metadata },
  };
});

async function postWebhook(body: unknown): Promise<{ status: number; json: unknown }> {
  const app = express();
  app.use(express.json());
  app.use("/api/billing", billingRouter);

  const server = app.listen(0);
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/billing/payments/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      json: await response.json(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

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

describe("YooKassa payment webhook", () => {
  it("does not apply credits from a forged succeeded webhook when provider status is still pending", async () => {
    mockState.providerPayment = {
      ...providerPayment,
      status: "pending",
      paid: false,
    };

    const response = await postWebhook({
      event: "payment.succeeded",
      object: {
        id: paymentRow.providerPaymentId,
        status: "succeeded",
      },
    });

    expect(response).toEqual({ status: 200, json: { ok: true } });
    expect(mockState.transactionCalls).toBe(0);
    expect(mockState.updates).toHaveLength(1);
    expect(mockState.updates[0]).toMatchObject({
      status: "pending",
      webhookVerified: true,
    });
  });

  it("does not update or apply credits when provider payment details do not match the row", async () => {
    mockState.providerPayment = {
      ...providerPayment,
      amount: {
        value: "1.00",
        currency: paymentRow.currency,
      },
    };

    const response = await postWebhook({
      event: "payment.succeeded",
      object: {
        id: paymentRow.providerPaymentId,
        status: "succeeded",
      },
    });

    expect(response).toEqual({ status: 200, json: { ok: true, verified: false } });
    expect(mockState.transactionCalls).toBe(0);
    expect(mockState.updates).toHaveLength(0);
  });
});
