import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  formatDbConnectError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
  getDatabaseConnectionDiagnostics: vi.fn(() => ({
    env: {},
    source: "DATABASE_URL",
    target: { host: "db.internal", database: "astrobot" },
  })),
  listPublicTables: vi.fn(async () => ["users"]),
}));

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@workspace/db", () => dbMocks);
vi.mock("../logger.js", () => ({ logger: loggerMocks }));

async function importDbInit() {
  vi.resetModules();
  return import("../db-init.js");
}

function flushMicrotasks() {
  return Promise.resolve();
}

describe("startDbInitInBackground", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps slow migrations pending and marks ready when they eventually succeed", async () => {
    vi.useFakeTimers();
    const { getDbInitError, getDbInitStatus, startDbInitInBackground } =
      await importDbInit();

    let resolveMigrations: () => void = () => {};
    const migrations = new Promise<void>((resolve) => {
      resolveMigrations = resolve;
    });
    const runMigrations = vi.fn(() => migrations);
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    } as unknown as Pool;

    startDbInitInBackground(pool, runMigrations);
    await vi.advanceTimersByTimeAsync(0);

    expect(runMigrations).toHaveBeenCalledOnce();
    expect(getDbInitStatus()).toBe("pending");

    await vi.advanceTimersByTimeAsync(30_001);

    expect(getDbInitStatus()).toBe("pending");
    expect(getDbInitError()).toBeUndefined();
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ elapsedMs: 30_000 }),
      "Database migrations still running",
    );

    resolveMigrations();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(0);

    expect(getDbInitStatus()).toBe("ready");
    expect(getDbInitError()).toBeUndefined();
    expect(dbMocks.listPublicTables).toHaveBeenCalledOnce();
    expect(loggerMocks.error).not.toHaveBeenCalledWith(
      expect.anything(),
      "Database migrations failed",
    );
  });
});
