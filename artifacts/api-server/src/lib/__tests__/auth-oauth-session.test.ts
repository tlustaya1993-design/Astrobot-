import { describe, expect, it } from "vitest";
import { getTrustedOAuthSessionId } from "../../routes/auth.js";

describe("getTrustedOAuthSessionId", () => {
  it("uses the middleware-derived session id", () => {
    expect(getTrustedOAuthSessionId({ sessionId: "trusted-session" })).toBe("trusted-session");
  });

  it("does not trust caller-controlled query session ids", () => {
    const req = {
      query: { sessionId: "attacker-session" },
    } as Parameters<typeof getTrustedOAuthSessionId>[0] & { query: { sessionId: string } };

    expect(getTrustedOAuthSessionId(req)).toBeNull();
  });
});
