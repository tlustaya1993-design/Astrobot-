import type { Pool } from "pg";

let migrationsReady: Promise<void> | null = null;

export async function runDbMigrations(pool: Pool): Promise<void> {
  if (!migrationsReady) {
    migrationsReady = (async () => {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS birth_time_unknown boolean NOT NULL DEFAULT false
      `);
    })().catch((error) => {
      migrationsReady = null;
      throw error;
    });
  }

  await migrationsReady;
}
