import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockUser = {
  id: number;
  sessionId: string;
  email: string | null;
  requestsUsed: number;
  requestsBalance: number;
};

const mockState = vi.hoisted(() => {
  const usersTable = {
    id: "users.id",
    sessionId: "users.session_id",
    email: "users.email",
    requestsUsed: "users.requests_used",
    requestsBalance: "users.requests_balance",
    updatedAt: "users.updated_at",
  };
  const paymentsTable = {
    id: "payments.id",
    sessionId: "payments.session_id",
    provider: "payments.provider",
    providerPaymentId: "payments.provider_payment_id",
    appPaymentId: "payments.app_payment_id",
    packageCode: "payments.package_code",
    creditsGranted: "payments.credits_granted",
    amountRub: "payments.amount_rub",
    currency: "payments.currency",
    status: "payments.status",
    description: "payments.description",
    metadataJson: "payments.metadata_json",
    metadata: "payments.metadata",
    creditsAppliedAt: "payments.credits_applied_at",
    createdAt: "payments.created_at",
    updatedAt: "payments.updated_at",
  };

  return {
    usersTable,
    paymentsTable,
    userRows: [] as MockUser[],
    paymentRows: [] as Array<Record<string, unknown>>,
    paymentInserts: [] as Array<Record<string, unknown>>,
    updateCalls: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
    lastYooKassaPayload: null as Record<string, unknown> | null,
    createYookassaPayment: vi.fn(async (payload: Record<string, unknown>) => {
      return {
        id: "yk_test_payment",
        status: "pending",
        confirmation: { confirmation_url: "https://pay.example.test/checkout" },
        metadata: payload.metadata,
      };
    }),
  };
});

function makeSelectChain() {
  let selectedTable: unknown;
  const chain = {
    from(table: unknown) {
      selectedTable = table;
      return chain;
    },
    where() {
      return chain;
    },
    orderBy() {
      return chain;
    },
    async limit() {
      if (selectedTable === mockState.usersTable) {
        return mockState.userRows;
      }
      if (selectedTable === mockState.paymentsTable) {
        return mockState.paymentRows;
      }
      return [];
    },
  };
  return chain;
}

vi.mock("@workspace/db", () => {
  const db = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        if (table === mockState.usersTable) {
          const row: MockUser = {
            id: mockState.userRows.length + 1,
            sessionId: String(values.sessionId),
            email: null,
            requestsUsed: 0,
            requestsBalance: 0,
          };
          mockState.userRows.push(row);
          return { returning: vi.fn(async () => [row]) };
        }
        if (table === mockState.paymentsTable) {
          mockState.paymentInserts.push(values);
        }
        return { returning: vi.fn(async () => []) };
      }),
    })),
    update: vi.fn((table: unknown) => {
      let values: Record<string, unknown> = {};
      const chain = {
        set(nextValues: Record<string, unknown>) {
          values = nextValues;
          return chain;
        },
        async where() {
          mockState.updateCalls.push({ table, values });
          if (table === mockState.usersTable && typeof values.email === "string") {
            for (const row of mockState.userRows) {
              if (!row.email) row.email = values.email;
            }
          }
          return [];
        },
      };
      return chain;
    }),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
  };

  return {
    db,
    usersTable: mockState.usersTable,
    paymentsTable: mockState.paymentsTable,
  };
});

vi.mock("../../lib/yookassa.js", () => {
  class YooKassaError extends Error {
    readonly kind: string;
    readonly operation: string;
    readonly status?: number;
    readonly body?: string;
    readonly requestId?: string;

    constructor(params: {
      message: string;
      kind: string;
      operation: string;
      status?: number;
      body?: string;
      requestId?: string;
    }) {
      super(params.message);
      this.name = "YooKassaError";
      this.kind = params.kind;
      this.operation = params.operation;
      this.status = params.status;
      this.body = params.body;
      this.requestId = params.requestId;
    }
  }

  return {
    YooKassaError,
    createYookassaPayment: vi.fn(async (payload: Record<string, unknown>) => {
      mockState.lastYooKassaPayload = payload;
      return mockState.createYookassaPayment(payload);
    }),
    getYookassaPayment: vi.fn(),
    parseYookassaNotification: vi.fn(),
    validateYookassaWebhook: vi.fn(() => false),
  };
});

vi.mock("../../lib/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { default: billingRouter } = await import("../billing.js");

async function postJson(app: express.Express, path: string, body: unknown): Promise<Response> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe("billing receipt email handling", () => {
  beforeEach(() => {
    mockState.userRows.splice(0, mockState.userRows.length, {
      id: 1,
      sessionId: "anon-session",
      email: null,
      requestsUsed: 0,
      requestsBalance: 0,
    });
    mockState.paymentRows.splice(0);
    mockState.paymentInserts.splice(0);
    mockState.updateCalls.splice(0);
    mockState.lastYooKassaPayload = null;
    mockState.createYookassaPayment.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses a guest receipt email for YooKassa without storing it as account identity", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as typeof req & { sessionId?: string }).sessionId = "anon-session";
      next();
    });
    app.use("/billing", billingRouter);

    const response = await postJson(app, "/billing/payments/create", {
      packageCode: "pack10",
      returnUrl: "https://astrobot.example.test/chat",
      receiptEmail: "Admin@Example.test",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      confirmationUrl: "https://pay.example.test/checkout",
      providerPaymentId: "yk_test_payment",
      status: "pending",
    });

    expect(mockState.lastYooKassaPayload).toMatchObject({
      receipt: {
        customer: {
          email: "admin@example.test",
        },
      },
    });
    expect(mockState.paymentInserts).toHaveLength(1);
    expect(mockState.userRows[0]?.email).toBeNull();
    expect(
      mockState.updateCalls.some((call) => call.table === mockState.usersTable),
    ).toBe(false);
  });
});
