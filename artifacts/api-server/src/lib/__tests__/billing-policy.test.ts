import { describe, expect, it } from "vitest";
import {
  canAffordRequest,
  coerceNonNegInt,
  getBalanceAfterCharge,
  getRemainingFreeRequests,
} from "../billing-policy.js";

describe("coerceNonNegInt", () => {
  it("treats null/undefined as 0", () => {
    expect(coerceNonNegInt(null)).toBe(0);
    expect(coerceNonNegInt(undefined)).toBe(0);
  });
});

describe("free request quota", () => {
  it("allows first free request with zero balance", () => {
    expect(canAffordRequest(0, 0, 1, null)).toBe(true);
    expect(getBalanceAfterCharge(0, 0, 1, null)).toBe(0);
    expect(getRemainingFreeRequests(0)).toBe(5);
  });

  it("allows request when requestsUsed is nullish (DB edge case)", () => {
    expect(canAffordRequest(null as unknown as number, null as unknown as number, 1, null)).toBe(true);
  });

  it("blocks when free quota exhausted and balance is zero", () => {
    expect(canAffordRequest(5, 0, 1, null)).toBe(false);
    expect(getRemainingFreeRequests(5)).toBe(0);
  });

  it("uses paid balance only after free quota", () => {
    expect(canAffordRequest(5, 2, 1, null)).toBe(true);
    expect(getBalanceAfterCharge(5, 2, 1, null)).toBe(1);
  });

  it("consumes two free slots for cost=2 when enough free remains", () => {
    expect(canAffordRequest(0, 0, 2, null)).toBe(true);
    expect(getBalanceAfterCharge(0, 0, 2, null)).toBe(0);
  });
});
