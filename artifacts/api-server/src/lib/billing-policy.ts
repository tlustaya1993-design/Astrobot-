const DEFAULT_FREE_REQUESTS_LIMIT = 5;
const DEFAULT_UNLIMITED_EMAILS: string[] = [];

/** Coerce DB/nullish billing counters — avoids NaN in canAfford when value is null. */
export function coerceNonNegInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function parseFreeQuota(): number {
  const raw = Number.parseInt(process.env.FREE_REQUESTS_QUOTA ?? "", 10);
  // Пустое/NaN/0: дефолт 5. Ноль в панелях часто означает «не задано», а не «запретить бесплатные».
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_FREE_REQUESTS_LIMIT;
  }
  return raw;
}

export const FREE_REQUESTS_LIMIT = parseFreeQuota();

export function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getVerifiedAccountEmail(
  authEmail: string | null | undefined,
  storedEmail: string | null | undefined,
): string | null {
  const normalizedAuthEmail = normalizeEmail(authEmail);
  const normalizedStoredEmail = normalizeEmail(storedEmail);
  if (!normalizedAuthEmail || normalizedAuthEmail !== normalizedStoredEmail) {
    return null;
  }
  return normalizedStoredEmail;
}

function buildUnlimitedEmailSet(): Set<string> {
  const configured = (process.env.UNLIMITED_REQUEST_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  return new Set([...DEFAULT_UNLIMITED_EMAILS, ...configured]);
}

const unlimitedEmailSet = buildUnlimitedEmailSet();

export function isUnlimitedEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 0 && unlimitedEmailSet.has(normalized);
}

export const isUnlimitedUser = isUnlimitedEmail;

export function getRemainingFreeRequests(requestsUsed: number): number {
  const used = coerceNonNegInt(requestsUsed);
  return Math.max(0, FREE_REQUESTS_LIMIT - used);
}

export function canAffordRequest(
  requestsUsed: number,
  requestsBalance: number,
  requestCost: number,
  email: string | null | undefined,
): boolean {
  if (requestCost <= 0) return true;
  if (isUnlimitedEmail(email)) return true;

  const used = coerceNonNegInt(requestsUsed);
  const balance = coerceNonNegInt(requestsBalance);
  const freeRemaining = getRemainingFreeRequests(used);
  const paidUnitsNeeded = Math.max(0, requestCost - freeRemaining);
  return balance >= paidUnitsNeeded;
}

export function getBalanceAfterCharge(
  requestsUsed: number,
  requestsBalance: number,
  requestCost: number,
  email: string | null | undefined,
): number {
  if (requestCost <= 0) return coerceNonNegInt(requestsBalance);
  if (isUnlimitedEmail(email)) return coerceNonNegInt(requestsBalance);

  const used = coerceNonNegInt(requestsUsed);
  const balance = coerceNonNegInt(requestsBalance);
  const freeRemaining = getRemainingFreeRequests(used);
  const paidUnitsNeeded = Math.max(0, requestCost - freeRemaining);
  return Math.max(0, balance - paidUnitsNeeded);
}
