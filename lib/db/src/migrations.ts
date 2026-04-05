import type { Pool } from "pg";

let migrationsReady: Promise<void> | null = null;

export async function runDbMigrations(pool: Pool): Promise<void> {
  if (!migrationsReady) {
    migrationsReady = (async () => {
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS birth_time_unknown boolean NOT NULL DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS avatar_hair_style text DEFAULT 'medium'
      `);
      await pool.query(`
        ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS avatar_hair_color text DEFAULT '#1c1c2e'
      `);
      await pool.query(`
        ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS avatar_robe_color text DEFAULT '#3730A3'
      `);
      await pool.query(`
        ALTER TABLE contacts
        ADD COLUMN IF NOT EXISTS avatar_eye_color text DEFAULT '#3B82F6'
      `);
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS avatar_json text
      `);
    })().catch((error) => {
      migrationsReady = null;
      throw error;
    });
  }

  await migrationsReady;
}
