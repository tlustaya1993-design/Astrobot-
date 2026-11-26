import { describe, expect, it } from "vitest";
import { computeNextRetryAt } from "../support-intake-queue.js";

describe("computeNextRetryAt", () => {
  it("schedules first failure after base delay", () => {
    const now = Date.parse("2026-11-26T10:00:00.000Z");
    const next = computeNextRetryAt(1, now, 15_000);
    expect(next.toISOString()).toBe("2026-11-26T10:00:15.000Z");
  });

  it("uses exponential backoff and caps at 15 minutes", () => {
    const now = Date.parse("2026-11-26T10:00:00.000Z");
    const second = computeNextRetryAt(2, now, 15_000);
    const late = computeNextRetryAt(20, now, 15_000);
    expect(second.toISOString()).toBe("2026-11-26T10:00:30.000Z");
    expect(late.getTime() - now).toBe(15 * 60_000);
  });
});
