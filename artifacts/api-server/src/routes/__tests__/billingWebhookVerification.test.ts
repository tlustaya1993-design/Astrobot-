import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const paymentRow = {
  id: 123,
  sessionId: "session-1",
  provider: "yookassa",
  providerPaymentId: "pay-123",
  status: "pending",
  creditsAppliedAt: null,
  creditsGranted: 30,
};

function makeSelectBuilder(rows: Row[]) {
  const result = Promise.resolve(rows);
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => result),
  };
  return builder;
}

function makeUpdateBuilder(setCalls: unknown[], returningRows: Row[] = []) {
  const builder = {
    set: vi.fn((payload: unknown) => {
      setCalls.push(payload);
      return builder;
    }),
    where: vi.fn(() => builder),
    returning: vi.fn(() => Promise.resolve(returningRows)),
  };
  return builder;
}

function installBillingMocks(providerPayment: { id: string; status: string; paid: boolean }) {
  const selectRows = [[{ id: 1 }], [paymentRow]];
  const updateSetCalls: unknown[] = [];
  const txUpdateSetCalls: unknown[] = [];

  const select = vi.fn(() => makeSelectBuilder(selectRows.shift() ?? []));
  const update = vi.fn(() => makeUpdateBuilder(updateSetCalls));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      select: vi.fn(() => makeSelectBuilder([{ ...paymentRow, status: "succeeded" }])),
      update: vi.fn((table: unknown) =>
        makeUpdateBuilder(txUpdateSetCalls, table === usersTable ? [{ id: 7 }] : []),
      ),
    };
    return callback(tx);
  });

  const paymentsTable = {
    id: "payments.id",
    sessionId: "payments.sessionId",
    provider: "payments.provider",
    providerPaymentId: "payments.providerPaymentId",
    status: "payments.status",
    creditsAppliedAt: "payments.creditsAppliedAt",
    creditsGranted: "payments.creditsGranted",
    updatedAt: "payments.updatedAt",
    createdAt: "payments.createdAt",
  };
  const usersTable = {
    id: "users.id",
    sessionId: "users.sessionId",
    requestsBalance: "users.requestsBalance",
    updatedAt: "users.updatedAt",
  };

  vi.doMock("@workspace/db", () => ({
    db: { select, update, transaction },
    paymentsTable,
    usersTable,
  }));
  vi.doMock("drizzle-orm", () => ({
    and: vi.fn(() => ({})),
    eq: vi.fn(() => ({})),
    sql: vi.fn(() => ({})),
  }));

  const getYookassaPayment = vi.fn(() => Promise.resolve(providerPayment));
  vi.doMock("../../lib/yookassa.js", () => ({
    createYookassaPayment: vi.fn(),
    getYookassaPayment,
    parseYookassaNotification: (body: unknown) => body,
    YooKassaError: class YooKassaError extends Error {},
    validateYookassaWebhook: vi.fn(() => true),
  }));
  vi.doMock("../../lib/logger.js", () => ({
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  }));
  vi.doMock("../../lib/billing-policy.js", () => ({
    FREE_REQUESTS_LIMIT: 5,
    isUnlimitedEmail: vi.fn(() => false),
  }));

  return { getYookassaPayment, transaction, updateSetCalls, txUpdateSetCalls };
}

async function startApp(): Promise<{ server: Server; url: string }> {
  const { default: router } = await import("../billing.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.sessionId = "session-1";
    next();
  });
  app.use("/billing", router);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe("POST /payments/webhook YooKassa verification", () => {
  afterEach(() => {
    vi.doUnmock("@workspace/db");
    vi.doUnmock("drizzle-orm");
    vi.doUnmock("../../lib/yookassa.js");
    vi.doUnmock("../../lib/logger.js");
    vi.doUnmock("../../lib/billing-policy.js");
    vi.resetModules();
  });

  it("does not apply credits from a forged succeeded notification when YooKassa still reports pending", async () => {
    const mocks = installBillingMocks({ id: "pay-123", status: "pending", paid: false });
    const { server, url } = await startApp();

    try {
      const response = await fetch(`${url}/billing/payments/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "notification",
          event: "payment.succeeded",
          object: { id: "pay-123", status: "succeeded", paid: true },
        }),
      });

      expect(response.status).toBe(200);
      expect(mocks.getYookassaPayment).toHaveBeenCalledWith("pay-123");
      expect(mocks.updateSetCalls[0]).toMatchObject({ status: "pending" });
      expect(mocks.transaction).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
