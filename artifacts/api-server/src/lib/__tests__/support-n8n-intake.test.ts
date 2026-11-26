import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSupportIntakePayload,
  deliverTicketIntakeWithRetry,
  forwardTicketToN8n,
} from "../support-n8n-intake.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("forwardTicketToN8n", () => {
  it("treats HTTP 2xx with empty body as success", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 200 }));

    const result = await forwardTicketToN8n(
      { description: "x", external_ref: "abc" },
      { webhookUrl: "https://n8n.example/webhook", fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats HTTP 2xx plain-text body as success without requiring JSON", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("ok accepted", { status: 202 }),
    );

    const result = await forwardTicketToN8n(
      { description: "x", external_ref: "abc" },
      { webhookUrl: "https://n8n.example/webhook", fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result).toEqual({ ok: true });
  });

  it("parses optional ticket_id/public_id from JSON when present", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(201, { ticket_id: 42, public_id: "n8n-pub" }),
    );

    const result = await forwardTicketToN8n(
      { description: "x", external_ref: "abc" },
      { webhookUrl: "https://n8n.example/webhook", fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result).toEqual({ ok: true, ticket_id: 42, public_id: "n8n-pub" });
  });

  it("returns http_error on non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 503 }));

    const result = await forwardTicketToN8n(
      { description: "x" },
      { webhookUrl: "https://n8n.example/webhook", fetchImpl: fetchImpl as unknown as typeof fetch },
    );

    expect(result).toEqual({ ok: false, reason: "http_error" });
  });
});

describe("deliverTicketIntakeWithRetry", () => {
  it("retries the same payload after a temporary N8N error, then succeeds", async () => {
    const payloads: string[] = [];
    const fetchImpl = vi
      .fn(async (_url: string, init?: RequestInit) => {
        payloads.push(String(init?.body ?? ""));
        if (fetchImpl.mock.calls.length === 1) {
          return new Response("busy", { status: 503 });
        }
        return new Response("", { status: 200 });
      })
      .mockName("fetchImpl");

    const sleep = vi.fn(async () => undefined);
    const payload = buildSupportIntakePayload({
      description: "payment stuck",
      sessionId: "sess-1",
      publicId: "11111111-1111-1111-1111-111111111111",
      appTicketId: 7,
    });

    const result = await deliverTicketIntakeWithRetry(payload, {
      webhookUrl: "https://n8n.example/webhook",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      attempts: 3,
      delaysMs: [0, 10, 10],
      sleep,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toBe(payloads[1]);
    expect(JSON.parse(payloads[0])).toMatchObject({
      app_ticket_id: 7,
      external_ref: "11111111-1111-1111-1111-111111111111",
      idempotency_key: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("does not create a new local identity across retries (stable idempotency keys)", async () => {
    const seen = new Set<string>();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        idempotency_key: string;
        app_ticket_id: number;
      };
      seen.add(`${body.app_ticket_id}:${body.idempotency_key}`);
      return new Response("fail", { status: 500 });
    });

    const payload = buildSupportIntakePayload({
      description: "x",
      sessionId: "s",
      publicId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      appTicketId: 99,
    });

    const result = await deliverTicketIntakeWithRetry(payload, {
      webhookUrl: "https://n8n.example/webhook",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      attempts: 3,
      delaysMs: [0, 0, 0],
      sleep: async () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(seen.size).toBe(1);
  });
});
