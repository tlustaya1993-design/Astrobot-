import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicTables: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@workspace/db", () => ({
  formatDbConnectError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
  })),
  getDatabaseConnectionDiagnostics: vi.fn(() => ({
    env: "test",
    source: "test",
    target: { database: "test" },
  })),
  listPublicTables: mocks.listPublicTables,
}));

vi.mock("../logger.js", () => ({
  logger: mocks.logger,
}));

function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("startDbInitInBackground", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("keeps waiting for slow migrations and marks the database ready when they succeed", async () => {
    vi.useFakeTimers();
    mocks.listPublicTables.mockResolvedValue(["users"]);

    const { getDbInitStatus, startDbInitInBackground } = await import("../db-init.js");
    const migration = deferred<void>();
    const runMigrations = vi.fn(() => migration.promise);
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    } as unknown as Pool;

    startDbInitInBackground(pool, runMigrations);
    await flushMicrotasks();

    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(getDbInitStatus()).toBe("pending");

    await vi.advanceTimersByTimeAsync(30_000);

    expect(getDbInitStatus()).toBe("pending");
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      { db: { database: "test" }, warnAfterMs: 30_000 },
      "Database migrations still running",
    );

    migration.resolve();
    await flushMicrotasks();

    expect(getDbInitStatus()).toBe("ready");
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });
});
