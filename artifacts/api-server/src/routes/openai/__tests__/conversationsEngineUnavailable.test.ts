import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const conversations = {
    id: "conversations.id",
    sessionId: "conversations.sessionId",
    contactId: "conversations.contactId",
    contactExtendedMode: "conversations.contactExtendedMode",
    createdAt: "conversations.createdAt",
    title: "conversations.title",
  };
  const messages = {
    id: "messages.id",
    conversationId: "messages.conversationId",
    role: "messages.role",
    content: "messages.content",
    messageType: "messages.messageType",
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
  };
  const memoriesTable = {
    sessionId: "memories.sessionId",
    updatedAt: "memories.updatedAt",
  };

  const select = vi.fn(() => ({
    from: vi.fn((table: unknown) => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () =>
          table === conversations
            ? [{ id: 123, sessionId: "session-1", contactId: null, contactExtendedMode: false }]
            : [],
        ),
        orderBy: vi.fn(async () => []),
      })),
      leftJoin: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(() => ({
              orderBy: vi.fn(async () => []),
            })),
          })),
        })),
      })),
    })),
  }));

  return {
    conversations,
    messages,
    usersTable,
    contactsTable,
    memoriesTable,
    select,
    insert: vi.fn(),
    update: vi.fn(),
    deleteFn: vi.fn(),
    checkAiThrottle: vi.fn(),
    markInFlight: vi.fn(),
    clearInFlight: vi.fn(),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.deleteFn,
  },
  conversations: mocks.conversations,
  messages: mocks.messages,
  usersTable: mocks.usersTable,
  contactsTable: mocks.contactsTable,
  memoriesTable: mocks.memoriesTable,
}));

vi.mock("../../../lib/astrology.js", () => ({
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
  validateNatalChart: vi.fn(),
}));

vi.mock("../../../lib/ai-rate-limit.js", () => ({
  detectTier: vi.fn(),
  checkAiThrottle: mocks.checkAiThrottle,
  markInFlight: mocks.markInFlight,
  clearInFlight: mocks.clearInFlight,
}));

vi.mock("../../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("../../../lib/telegram-alert.js", () => ({
  sendTelegramAlert: vi.fn(),
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: {
    messages: {
      stream: vi.fn(),
      create: vi.fn(),
    },
  },
}));

async function startServer(): Promise<{ server: Server; url: string }> {
  const { default: router } = await import("../conversations.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.sessionId = String(req.headers["x-session-id"] || "");
    next();
  });
  app.use("/api/openai", router);

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

describe("POST /conversations/:id/messages when the astrology engine is unavailable", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => (err ? reject(err) : resolve()));
      });
      server = undefined;
    }
    vi.clearAllMocks();
  });

  it("returns the controlled SSE error before mutating persistent chat state", async () => {
    const started = await startServer();
    server = started.server;

    const res = await fetch(`${started.url}/api/openai/conversations/123/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": "session-1",
      },
      body: JSON.stringify({ content: "Расскажи про мой период" }),
    });
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("Астрологический движок временно недоступен");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.checkAiThrottle).not.toHaveBeenCalled();
    expect(mocks.markInFlight).not.toHaveBeenCalled();
    expect(mocks.clearInFlight).not.toHaveBeenCalled();
  });
});
