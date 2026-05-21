import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn(
    "[db] DATABASE_URL is not set — HTTP server will start; API database routes will fail until configured",
  );
}

/** Пул создаётся синхронно, но соединение — только при запросе (connectionTimeoutMillis). */
export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    })
  : null;

export const isDatabaseConfigured = (): boolean => pool !== null;

type AppDb = ReturnType<typeof drizzle<typeof schema>>;

/** При отсутствии pool значение null в runtime; маршруты защищены middleware + isDatabaseConfigured(). */
export const db: AppDb = (
  pool ? drizzle(pool, { schema }) : null
) as AppDb;

export * from "./schema";
export * from "./migrations";
