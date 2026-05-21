/**
 * Локальный one-off: ждёт БД и применяет runDbMigrations (без drizzle-kit push).
 * На Railway не используется — миграции в src/index.ts при старте API.
 *
 * Запуск: DATABASE_URL=... pnpm exec tsx ./src/migrate.ts
 */
import { pool, runDbMigrations } from "@workspace/db";

async function waitForDb(maxRetries = 10, delayMs = 3000): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query("SELECT 1");
      console.log("Database is ready!");
      return;
    } catch {
      console.log(`Waiting for database... (${i + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Database not ready after max retries");
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set, skipping migrations");
  process.exit(0);
}

await waitForDb();
await runDbMigrations(pool);
console.log("Migrations complete!");
await pool.end();
