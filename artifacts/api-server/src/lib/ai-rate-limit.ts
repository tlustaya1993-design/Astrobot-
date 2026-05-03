import { logger } from "./logger.js";

const REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL?.trim() || "";
const REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || "";

export type UserTier = "guest" | "registered" | "paid";

/** Minimum milliseconds between AI requests per tier — technical safeguard, not a business limit. */
const INTERVAL_MS: Record<UserTier, number> = {
  guest: 5_000,       // anonymous: stricter — no account accountability
  registered: 3_000,  // has email: moderate
  paid: 2_000,        // has paid balance / unlimited: soft floor, prevents runaway loops
};

// In-memory fallbacks — work without Redis on single-instance deployments
const inMemoryLastRequest = new Map<string, number>(); // sessionId → last request timestamp
const inMemoryInFlight = new Set<string>();            // sessionIds currently processing
let lastCleanup = Date.now();

function cleanupInMemory(now = Date.now()) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, ts] of inMemoryLastRequest.entries()) {
    if (now - ts > 60_000) inMemoryLastRequest.delete(k);
  }
}

export function hasRedis(): boolean {
  return Boolean(REDIS_REST_URL && REDIS_REST_TOKEN);
}

async function upstashCall(path: string): Promise<unknown> {
  const url = `${REDIS_REST_URL.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${REDIS_REST_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash error (${res.status})`);
  return ((await res.json()) as { result?: unknown }).result;
}

/** Detect tier from user profile. */
export function detectTier(
  email: string | null | undefined,
  requestsBalance: number,
  isUnlimited: boolean,
): UserTier {
  if (!email) return "guest";
  if (isUnlimited || requestsBalance > 0) return "paid";
  return "registered";
}

export interface ThrottleResult {
  ok: boolean;
  reason?: "interval" | "inflight";
  message: string;
  waitSec: number;
}

async function checkInterval(sessionId: string, intervalMs: number): Promise<{ ok: boolean; waitMs: number }> {
  if (hasRedis()) {
    try {
      const key = `ai:throttle:${sessionId}`;
      const result = await upstashCall(
        `set/${encodeURIComponent(key)}/1?NX=true&PX=${intervalMs}`,
      );
      if (result === "OK") return { ok: true, waitMs: 0 };
      const pttl = await upstashCall(`pttl/${encodeURIComponent(key)}`);
      const waitMs = typeof pttl === "number" && pttl > 0 ? pttl : intervalMs;
      return { ok: false, waitMs };
    } catch (err) {
      logger.warn({ err }, "AI interval throttle Redis check failed, falling back to in-memory");
    }
  }

  const now = Date.now();
  cleanupInMemory(now);
  const last = inMemoryLastRequest.get(sessionId);
  if (!last || now - last >= intervalMs) {
    inMemoryLastRequest.set(sessionId, now);
    return { ok: true, waitMs: 0 };
  }
  return { ok: false, waitMs: intervalMs - (now - last) };
}

/**
 * Check both the in-flight lock and the per-session interval throttle.
 * Call markInFlight() after a successful check, clearInFlight() in finally.
 */
export async function checkAiThrottle(sessionId: string, tier: UserTier): Promise<ThrottleResult> {
  // In-flight is always in-memory: the SSE response is tied to this process anyway,
  // so cross-instance tracking isn't needed here.
  if (inMemoryInFlight.has(sessionId)) {
    return {
      ok: false,
      reason: "inflight",
      message: "Подожди немного — я ещё работаю над твоим предыдущим запросом 🙂",
      waitSec: 5,
    };
  }

  const { ok, waitMs } = await checkInterval(sessionId, INTERVAL_MS[tier]);
  if (!ok) {
    return {
      ok: false,
      reason: "interval",
      message: "Слишком быстро 🙂 Подожди пару секунд — я уже разбираю твой запрос.",
      waitSec: Math.max(1, Math.ceil(waitMs / 1000)),
    };
  }

  return { ok: true, message: "", waitSec: 0 };
}

/** Mark a session as currently processing an AI request. */
export function markInFlight(sessionId: string): void {
  inMemoryInFlight.add(sessionId);
}

/** Release the in-flight lock. Always call in finally. */
export function clearInFlight(sessionId: string): void {
  inMemoryInFlight.delete(sessionId);
}

/** Ping Upstash to verify connectivity. Returns false if Redis is not configured or unreachable. */
export async function pingRedis(): Promise<boolean> {
  if (!hasRedis()) return false;
  try {
    const result = await upstashCall(
      `set/${encodeURIComponent("ai:status:ping")}/1?PX=10000`,
    );
    return result === "OK";
  } catch {
    return false;
  }
}
