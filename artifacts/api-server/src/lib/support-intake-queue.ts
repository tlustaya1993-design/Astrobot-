import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, pool, supportMessages, supportTickets } from "@workspace/db";
import { logger } from "./logger.js";
import {
  buildSupportIntakePayload,
  deliverTicketIntakeWithRetry,
  type N8nIntakeResult,
} from "./support-n8n-intake.js";

const DEFAULT_BASE_DELAY_MS = Number(process.env.SUPPORT_INTAKE_RETRY_DELAY_MS || 15_000);
const DEFAULT_MAX_ATTEMPTS = Number(process.env.SUPPORT_INTAKE_MAX_ATTEMPTS || 12);
const DEFAULT_POLL_MS = Number(process.env.SUPPORT_INTAKE_POLL_MS || 10_000);
const DELIVERED_NOTE = "Обращение доставлено в поддержку (повторная отправка).";

export function computeNextRetryAt(
  attemptsAfterThisFailure: number,
  now = Date.now(),
  baseDelayMs = DEFAULT_BASE_DELAY_MS,
): Date {
  const capped = Math.min(
    15 * 60_000,
    baseDelayMs * 2 ** Math.max(0, attemptsAfterThisFailure - 1),
  );
  return new Date(now + Math.max(1_000, capped));
}

type Db = NonNullable<typeof db>;

function requireDb(): Db {
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function markIntakeDelivered(
  ticketId: number,
  n8n: Extract<N8nIntakeResult, { ok: true }>,
  options: { appendSystemNote?: boolean } = {},
) {
  const database = requireDb();
  const [existing] = await database
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!existing) return null;

  const [updated] = await database
    .update(supportTickets)
    .set({
      status: existing.status === "open" ? "analyzing" : existing.status,
      n8nTicketId: n8n.ticket_id ?? existing.n8nTicketId,
      n8nPublicId: n8n.public_id ?? existing.n8nPublicId,
      intakeDeliveredAt: existing.intakeDeliveredAt ?? new Date(),
      intakeNextRetryAt: null,
      intakeLastError: null,
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, ticketId))
    .returning();

  if (options.appendSystemNote && !existing.intakeDeliveredAt) {
    await database.insert(supportMessages).values({
      ticketId,
      role: "system",
      content: DELIVERED_NOTE,
      source: "system",
    });
  }

  return updated ?? existing;
}

/** Persist durable retry schedule — survives Railway restarts. */
export async function enqueueIntakeRetry(
  ticketId: number,
  reason: string,
  options: { attempts?: number; baseDelayMs?: number } = {},
) {
  const database = requireDb();
  const [ticket] = await database
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket || ticket.intakeDeliveredAt) return ticket ?? null;

  const attempts = options.attempts ?? ticket.intakeAttempts + 1;
  const nextRetryAt = computeNextRetryAt(attempts, Date.now(), options.baseDelayMs);

  const [updated] = await database
    .update(supportTickets)
    .set({
      status: "open",
      intakeAttempts: attempts,
      intakeNextRetryAt: nextRetryAt,
      intakeLastError: reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(supportTickets.id, ticketId), isNull(supportTickets.intakeDeliveredAt)))
    .returning();

  return updated ?? ticket;
}

/**
 * Claim due rows with SKIP LOCKED so concurrent pollers don't double-send.
 * Leases by bumping intake_next_retry_at ~60s forward.
 */
export async function claimDueIntakeTickets(limit = 10) {
  if (!pool || !db) return [];

  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 60_000);

  const claimed = await pool.query<{ id: number }>(
    `UPDATE support_tickets
     SET intake_next_retry_at = $1::timestamptz,
         updated_at = now()
     WHERE id IN (
       SELECT id FROM support_tickets
       WHERE intake_delivered_at IS NULL
         AND intake_next_retry_at IS NOT NULL
         AND intake_next_retry_at <= $2::timestamptz
         AND intake_attempts < $3
       ORDER BY intake_next_retry_at ASC
       LIMIT $4
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id`,
    [leaseUntil.toISOString(), now.toISOString(), DEFAULT_MAX_ATTEMPTS, limit],
  );

  const ids = claimed.rows.map((r) => Number(r.id)).filter(Number.isFinite);
  if (ids.length === 0) return [];

  return db.select().from(supportTickets).where(inArray(supportTickets.id, ids));
}

export async function attemptTicketIntakeDelivery(
  ticket: typeof supportTickets.$inferSelect,
  options: { appendSystemNoteOnSuccess?: boolean; inlineAttempts?: number } = {},
): Promise<{
  ticket: typeof supportTickets.$inferSelect | null;
  result: N8nIntakeResult;
}> {
  if (ticket.intakeDeliveredAt) {
    return {
      ticket,
      result: {
        ok: true,
        ticket_id: ticket.n8nTicketId ?? undefined,
        public_id: ticket.n8nPublicId ?? undefined,
      },
    };
  }

  const payload = buildSupportIntakePayload({
    description: ticket.description,
    expectedBehavior: ticket.expectedBehavior,
    screenshotUrl: ticket.screenshotUrl,
    sessionId: ticket.sessionId,
    conversationId: ticket.conversationId,
    publicId: ticket.publicId,
    appTicketId: ticket.id,
  });

  const result = await deliverTicketIntakeWithRetry(payload, {
    attempts: options.inlineAttempts ?? 3,
    delaysMs: [0, 250, 750],
  });

  if (result.ok) {
    const updated = await markIntakeDelivered(ticket.id, result, {
      appendSystemNote: options.appendSystemNoteOnSuccess === true,
    });
    return { ticket: updated, result };
  }

  const updated = await enqueueIntakeRetry(ticket.id, result.reason);
  return { ticket: updated, result };
}

export async function processDueIntakeRetries(): Promise<number> {
  if (!db || !pool) return 0;
  let processed = 0;
  try {
    const due = await claimDueIntakeTickets(10);
    for (const ticket of due) {
      processed += 1;
      const { result } = await attemptTicketIntakeDelivery(ticket, {
        appendSystemNoteOnSuccess: true,
        inlineAttempts: 2,
      });
      if (!result.ok) {
        logger.warn(
          { ticketId: ticket.id, reason: result.reason, attempts: ticket.intakeAttempts },
          "Durable support intake retry failed",
        );
      } else {
        logger.info({ ticketId: ticket.id }, "Durable support intake retry succeeded");
      }
    }
  } catch (err) {
    logger.warn({ err }, "processDueIntakeRetries failed");
  }
  return processed;
}

let pollerStarted = false;
let pollerTimer: ReturnType<typeof setInterval> | null = null;

/** Poller only wakes work; schedule state lives in Postgres. */
export function startSupportIntakeRetryPoller(): void {
  if (pollerStarted) return;
  pollerStarted = true;

  const tick = () => {
    void processDueIntakeRetries();
  };

  tick();
  pollerTimer = setInterval(tick, Math.max(5_000, DEFAULT_POLL_MS));
  pollerTimer.unref?.();
  logger.info(
    { pollMs: Math.max(5_000, DEFAULT_POLL_MS), maxAttempts: DEFAULT_MAX_ATTEMPTS },
    "Support intake durable retry poller started",
  );
}

export function stopSupportIntakeRetryPoller(): void {
  if (pollerTimer) clearInterval(pollerTimer);
  pollerTimer = null;
  pollerStarted = false;
}
