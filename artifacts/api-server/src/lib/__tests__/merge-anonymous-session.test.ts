import { describe, expect, it } from "vitest";
import { canMergeAnonymousSessionWithEmail } from "../merge-anonymous-session.js";

describe("canMergeAnonymousSessionWithEmail", () => {
  const dest = { sessionId: "dest-session", email: "user@example.com" };

  it("allows merging a pure anonymous guest into an account", () => {
    expect(
      canMergeAnonymousSessionWithEmail(
        { sessionId: "guest-session", email: null, passwordHash: null },
        dest,
      ),
    ).toBe(true);
  });

  it("allows merging a guest whose receipt email matches the account email", () => {
    expect(
      canMergeAnonymousSessionWithEmail(
        {
          sessionId: "guest-session",
          email: "user@example.com",
          passwordHash: null,
        },
        dest,
      ),
    ).toBe(true);
  });

  it("rejects merging when source email belongs to a different identity", () => {
    expect(
      canMergeAnonymousSessionWithEmail(
        {
          sessionId: "other-oauth-session",
          email: "other@example.com",
          passwordHash: null,
        },
        dest,
      ),
    ).toBe(false);
  });

  it("rejects merging a password-registered account", () => {
    expect(
      canMergeAnonymousSessionWithEmail(
        {
          sessionId: "registered-session",
          email: null,
          passwordHash: "hash",
        },
        dest,
      ),
    ).toBe(false);
  });

  it("rejects merging a session into itself", () => {
    expect(
      canMergeAnonymousSessionWithEmail(
        { sessionId: "dest-session", email: null, passwordHash: null },
        dest,
      ),
    ).toBe(false);
  });
});
