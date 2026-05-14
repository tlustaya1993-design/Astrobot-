import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

type Rows = Array<Record<string, unknown>>;

function makeSelectBuilder(rows: Rows) {
  const result = Promise.resolve(rows);
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn(() => builder),
    groupBy: vi.fn(() => builder),
    orderBy: vi.fn(() => result),
    limit: vi.fn(() => result),
  };
  return builder;
}

function makeMutationBuilder() {
  const returning = vi.fn(() => Promise.resolve([{ id: 101 }]));
  const onConflictDoNothing = vi.fn(() => Promise.resolve());
  const valuesResult = { returning, onConflictDoNothing };
  const values = vi.fn(() => valuesResult);
  const where = vi.fn(() => Promise.resolve());
  const set = vi.fn(() => ({ where }));
  return { values, returning, onConflictDoNothing, set, where };
}

function installUnavailableEngineMocks() {
  const selectRows: Rows[] = [
    [{ id: 42, sessionId: "session-1", contactId: null, contactExtendedMode: false }],
    [{ id: 7 }],
    [{ sessionId: "session-1", email: "paid@example.test", requestsUsed: 5, requestsBalance: 10 }],
    [],
    [{ sessionId: "session-1", requestsUsed: 5, requestsBalance: 10 }],
    [{ id: 7, name: "Contact" }],
    [],
  ];

  const select = vi.fn(() => makeSelectBuilder(selectRows.shift() ?? []));
  const insert = vi.fn(() => makeMutationBuilder());
  const update = vi.fn(() => makeMutationBuilder());
  const deleteMock = vi.fn(() => makeMutationBuilder());

  const conversations = {
    id: "conversations.id",
    sessionId: "conversations.sessionId",
    contactId: "conversations.contactId",
    contactExtendedMode: "conversations.contactExtendedMode",
    title: "conversations.title",
    createdAt: "conversations.createdAt",
  };
  const messages = {
    id: "messages.id",
    conversationId: "messages.conversationId",
    role: "messages.role",
    content: "messages.content",
    createdAt: "messages.createdAt",
  };
  const usersTable = {
    sessionId: "users.sessionId",
    email: "users.email",
    requestsUsed: "users.requestsUsed",
    requestsBalance: "users.requestsBalance",
    updatedAt: "users.updatedAt",
  };
  const contactsTable = {
    id: "contacts.id",
    sessionId: "contacts.sessionId",
    name: "contacts.name",
    relation: "contacts.relation",
    avatarJson: "contacts.avatarJson",
  };
  const memoriesTable = {
    id: "memories.id",
    sessionId: "memories.sessionId",
    updatedAt: "memories.updatedAt",
  };

  vi.doMock("@workspace/db", () => ({
    db: { select, insert, update, delete: deleteMock },
    conversations,
    messages,
    usersTable,
    contactsTable,
    memoriesTable,
  }));
  vi.doMock("drizzle-orm", () => ({
    eq: vi.fn(() => ({})),
    desc: vi.fn(() => ({})),
    and: vi.fn(() => ({})),
    sql: vi.fn(() => ({})),
  }));

  vi.doMock("../../../lib/astrology.js", () => ({
    SWE_AVAILABLE: false,
    AstroEngineError: class AstroEngineError extends Error {},
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
    validateNatalChart: vi.fn(() => ({ planetsValid: true, housesValid: true })),
  }));

  const checkAiThrottle = vi.fn(() =>
    Promise.resolve({ ok: true, message: "", waitSec: 0 }),
  );
  const markInFlight = vi.fn();
  const clearInFlight = vi.fn();
  vi.doMock("../../../lib/ai-rate-limit.js", () => ({
    detectTier: vi.fn(() => "paid"),
    checkAiThrottle,
    markInFlight,
    clearInFlight,
  }));
  vi.doMock("../../../lib/logger.js", () => ({
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  }));
  vi.doMock("../../../lib/telegram-alert.js", () => ({
    sendTelegramAlert: vi.fn(() => Promise.resolve()),
  }));
  vi.doMock("@workspace/integrations-anthropic-ai", () => ({
    anthropic: { messages: { create: vi.fn() } },
  }));

  return { select, insert, update, deleteMock, checkAiThrottle, markInFlight, clearInFlight };
}

async function startApp(): Promise<{ server: Server; url: string }> {
  const { default: router } = await import("../conversations.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.sessionId = "session-1";
    next();
  });
  app.use("/openai", router);

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe("POST /conversations/:id/messages when the astro engine is unavailable", () => {
  afterEach(() => {
    vi.doUnmock("@workspace/db");
    vi.doUnmock("drizzle-orm");
    vi.doUnmock("../../../lib/astrology.js");
    vi.doUnmock("../../../lib/ai-rate-limit.js");
    vi.doUnmock("../../../lib/logger.js");
    vi.doUnmock("../../../lib/telegram-alert.js");
    vi.doUnmock("@workspace/integrations-anthropic-ai");
    vi.resetModules();
  });

  it("returns an SSE error before debiting, inserting messages, or taking the in-flight lock", async () => {
    const mocks = installUnavailableEngineMocks();
    const { server, url } = await startApp();

    try {
      const response = await fetch(`${url}/openai/conversations/42/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Расскажи про мою карту",
          contactId: 7,
          contactExtendedMode: true,
        }),
      });

      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      expect(body).toContain("Астрологический движок временно недоступен");
      expect(mocks.select).toHaveBeenCalledTimes(1);
      expect(mocks.checkAiThrottle).not.toHaveBeenCalled();
      expect(mocks.markInFlight).not.toHaveBeenCalled();
      expect(mocks.clearInFlight).not.toHaveBeenCalled();
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.deleteMock).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
