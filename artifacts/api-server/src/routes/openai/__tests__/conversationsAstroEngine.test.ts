import express from "express";
import type { AddressInfo } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";

const dbCalls = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; values: unknown }>,
  updates: [] as Array<{ table: string; values: unknown }>,
  markInFlight: vi.fn(),
  clearInFlight: vi.fn(),
  reset() {
    this.inserts.length = 0;
    this.updates.length = 0;
    this.markInFlight.mockClear();
    this.clearInFlight.mockClear();
  },
}));

const tables = vi.hoisted(() => ({
  conversations: { __name: "conversations", id: "conversations.id", sessionId: "conversations.sessionId" },
  messages: { __name: "messages", id: "messages.id", conversationId: "messages.conversationId", createdAt: "messages.createdAt" },
  usersTable: {
    __name: "users",
    sessionId: "users.sessionId",
    email: "users.email",
    requestsUsed: "users.requestsUsed",
    requestsBalance: "users.requestsBalance",
  },
  contactsTable: { __name: "contacts", id: "contacts.id", sessionId: "contacts.sessionId" },
  memoriesTable: { __name: "memories", sessionId: "memories.sessionId", updatedAt: "memories.updatedAt" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  desc: vi.fn((arg: unknown) => ({ op: "desc", arg })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: "eq", left, right })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock("@workspace/db", () => {
  function select() {
    let tableName = "";
    const builder = {
      from(table: { __name?: string }) {
        tableName = table.__name ?? "";
        return builder;
      },
      leftJoin() {
        return builder;
      },
      where() {
        return builder;
      },
      groupBy() {
        return builder;
      },
      orderBy() {
        if (tableName === "messages") return Promise.resolve([]);
        return builder;
      },
      limit() {
        if (tableName === "conversations") {
          return Promise.resolve([{ id: 1, sessionId: "session-1", contactId: null, contactExtendedMode: false }]);
        }
        if (tableName === "users") {
          return Promise.resolve([{ sessionId: "session-1", email: null, requestsUsed: 0, requestsBalance: 10 }]);
        }
        return Promise.resolve([]);
      },
    };
    return builder;
  }

  function insert(table: { __name?: string }) {
    return {
      values(values: unknown) {
        dbCalls.inserts.push({ table: table.__name ?? "", values });
        return {
          returning() {
            return Promise.resolve([{ id: 123 }]);
          },
          onConflictDoNothing() {
            return Promise.resolve();
          },
        };
      },
    };
  }

  function update(table: { __name?: string }) {
    return {
      set(values: unknown) {
        dbCalls.updates.push({ table: table.__name ?? "", values });
        return {
          where() {
            return Promise.resolve();
          },
        };
      },
    };
  }

  return {
    db: {
      select,
      insert,
      update,
      delete: vi.fn(),
    },
    ...tables,
  };
});

vi.mock("../../../lib/astrology.js", () => ({
  SWE_AVAILABLE: false,
  calcNatalChart: vi.fn(),
  calcEphemeris: vi.fn(),
  calcSolarReturn: vi.fn(),
  calcProgressions: vi.fn(),
  calcSynastry: vi.fn(),
  calcLunarReturn: vi.fn(),
  calcSolarArcDirections: vi.fn(),
  calcTransitPerfections: vi.fn(),
  formatNatalForPrompt: vi.fn(),
  formatEphemerisForPrompt: vi.fn(),
  formatSolarReturnForPrompt: vi.fn(),
  formatProgressionsForPrompt: vi.fn(),
  formatSynastryForPrompt: vi.fn(),
  formatLunarReturnForPrompt: vi.fn(),
  formatSolarArcForPrompt: vi.fn(),
  formatTransitPerfectionsForPrompt: vi.fn(),
  validateNatalChart: vi.fn(),
}));

vi.mock("../../../lib/ai-rate-limit.js", () => ({
  detectTier: vi.fn(() => "paid"),
  checkAiThrottle: vi.fn(async () => ({ ok: true, message: "", waitSec: 0 })),
  markInFlight: dbCalls.markInFlight,
  clearInFlight: dbCalls.clearInFlight,
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../../../lib/telegram-alert.js", () => ({
  sendTelegramAlert: vi.fn(async () => undefined),
}));

vi.mock("../../../lib/billing-policy.js", () => ({
  FREE_REQUESTS_LIMIT: 5,
  isUnlimitedUser: vi.fn(() => false),
  getRemainingFreeRequests: vi.fn(() => 5),
  canAffordRequest: vi.fn(() => true),
  getBalanceAfterCharge: vi.fn(() => 9),
}));

vi.mock("../../../lib/avatar-config.js", () => ({
  parseAvatarJson: vi.fn(() => null),
}));

vi.mock("../../../lib/astroMessageFilter.js", () => ({
  isAstroAssistantMessage: vi.fn(() => false),
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: {
    messages: {
      create: vi.fn(),
      stream: vi.fn(),
    },
  },
}));

async function postMessage() {
  const { default: router } = await import("../conversations.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as typeof req & { sessionId: string }).sessionId = "session-1";
    next();
  });
  app.use("/api", router);

  const server = app.listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    return await fetch(`http://127.0.0.1:${port}/api/conversations/1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Расскажи про мой транзит" }),
    });
  } finally {
    server.close();
  }
}

describe("POST /conversations/:id/messages when Swiss Ephemeris is unavailable", () => {
  afterEach(() => {
    dbCalls.reset();
  });

  it("returns an SSE error before charging, inserting messages, or marking the request in flight", async () => {
    const response = await postMessage();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("Астрологический движок временно недоступен");
    expect(dbCalls.inserts).toEqual([]);
    expect(dbCalls.updates).toEqual([]);
    expect(dbCalls.markInFlight).not.toHaveBeenCalled();
    expect(dbCalls.clearInFlight).not.toHaveBeenCalled();
  });
});
