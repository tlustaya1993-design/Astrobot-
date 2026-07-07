import { describe, expect, it } from "vitest";
import { getJwtSecret } from "../auth-jwt.js";

describe("getJwtSecret", () => {
  it("uses the configured JWT_SECRET when present", () => {
    expect(getJwtSecret({ NODE_ENV: "production", JWT_SECRET: "configured-secret" })).toBe(
      "configured-secret",
    );
  });

  it("allows the development fallback outside production", () => {
    expect(getJwtSecret({ NODE_ENV: "development" })).toBe("astrobot-dev-secret-change-in-production");
  });

  it("fails closed in production when JWT_SECRET is missing", () => {
    expect(() => getJwtSecret({ NODE_ENV: "production" })).toThrow(
      "JWT_SECRET is required in production",
    );
  });
});
