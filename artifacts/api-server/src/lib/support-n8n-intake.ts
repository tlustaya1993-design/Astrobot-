import { logger } from "./logger.js";

export type N8nIntakeFailReason = "url_unset" | "http_error" | "network_error";

export type N8nIntakeResult =
  | { ok: true; ticket_id?: number; public_id?: string }
  | { ok: false; reason: N8nIntakeFailReason };

export type SupportIntakePayload = {
  description: string;
  expected_behavior: string;
  screenshot_url: string;
  session_id: string;
  conversation_id: string;
  source: string;
  /** Stable app-side id — n8n must upsert by this, not create a new ticket. */
  external_ref: string;
  app_ticket_id: number;
  /** Same as external_ref; explicit idempotency for webhook handlers. */
  idempotency_key: string;
  client_context: unknown;
};

export function buildSupportIntakePayload(input: {
  description: string;
  expectedBehavior?: string | null;
  screenshotUrl?: string | null;
  sessionId: string;
  conversationId?: number | null;
  publicId: string;
  appTicketId: number;
  clientContext?: unknown;
}): SupportIntakePayload {
  return {
    description: input.description,
    expected_behavior: input.expectedBehavior || "",
    screenshot_url: input.screenshotUrl || "",
    session_id: input.sessionId,
    conversation_id:
      input.conversationId != null ? String(input.conversationId) : "",
    source: "astrobot_app",
    external_ref: input.publicId,
    app_ticket_id: input.appTicketId,
    idempotency_key: input.publicId,
    client_context: input.clientContext ?? null,
  };
}

type ForwardOptions = {
  webhookUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * POST ticket intake to n8n.
 * Any HTTP 2xx is success — JSON ticket_id/public_id are optional extras.
 */
export async function forwardTicketToN8n(
  payload: Record<string, unknown>,
  options: ForwardOptions = {},
): Promise<N8nIntakeResult> {
  const webhookUrl =
    options.webhookUrl ?? process.env.N8N_WEBHOOK_URL?.trim() ?? "";
  if (!webhookUrl) return { ok: false, reason: "url_unset" };

  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const res = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn({ status: res.status, body }, "n8n ticket intake failed");
      return { ok: false, reason: "http_error" };
    }

    // 2xx = delivered. Body may be empty, plain text, or JSON with optional ids.
    const raw = await res.text().catch(() => "");
    const trimmed = raw.trim();
    if (!trimmed) return { ok: true };

    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>;
      const ticketId = Number(data.ticket_id ?? data.id);
      return {
        ok: true,
        ticket_id: Number.isFinite(ticketId) ? ticketId : undefined,
        public_id: typeof data.public_id === "string" ? data.public_id : undefined,
      };
    } catch {
      return { ok: true };
    }
  } catch (err) {
    logger.warn({ err }, "n8n ticket intake error");
    return { ok: false, reason: "network_error" };
  }
}

export type RetryOptions = ForwardOptions & {
  attempts?: number;
  /** Delay before attempt i (ms). Index 0 is before first try. */
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * Retries the same payload (same external_ref / idempotency_key / app_ticket_id)
 * so n8n can dedupe instead of creating duplicate tickets.
 */
export async function deliverTicketIntakeWithRetry(
  payload: Record<string, unknown>,
  options: RetryOptions = {},
): Promise<N8nIntakeResult> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const delaysMs = options.delaysMs ?? [0, 250, 750];
  const sleep = options.sleep ?? defaultSleep;

  let last: N8nIntakeResult = { ok: false, reason: "network_error" };

  for (let i = 0; i < attempts; i++) {
    const delay = delaysMs[i] ?? delaysMs[delaysMs.length - 1] ?? 0;
    if (delay > 0) await sleep(delay);

    last = await forwardTicketToN8n(payload, options);
    if (last.ok) return last;
    // Misconfiguration won't heal by retrying.
    if (last.reason === "url_unset") return last;
  }

  return last;
}
