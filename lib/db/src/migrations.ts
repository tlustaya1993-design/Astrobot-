import type { Pool } from "pg";

let migrationsReady: Promise<void> | null = null;

export async function runDbMigrations(pool: Pool): Promise<void> {
  if (!migrationsReady) {
    migrationsReady = (async () => {
      // users — baseline columns used by /api/users/me and auth (schema drift guard)
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_time text`);
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS birth_time_unknown boolean NOT NULL DEFAULT false
      `);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_place text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_lat double precision`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_lng double precision`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_json text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language text DEFAULT 'ru'`);
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS onboarding_done boolean NOT NULL DEFAULT false
      `);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tone_preferred_depth text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tone_preferred_style text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tone_emotional_sensitivity text`);
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tone_familiarity_level text`);
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS requests_balance integer NOT NULL DEFAULT 0
      `);
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS requests_used integer NOT NULL DEFAULT 0
      `);
      await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false
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
        ALTER TABLE conversations
        ADD COLUMN IF NOT EXISTS contact_extended_mode boolean NOT NULL DEFAULT false
      `);
      await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'chat'
      `);
    })().catch((error) => {
      migrationsReady = null;
      throw error;
    });
  }

  await migrationsReady;
}
