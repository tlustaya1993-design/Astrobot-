import type { Pool } from "pg";
import { ensureBootstrapSchema, listPublicTables } from "./bootstrap-schema.js";

let migrationsReady: Promise<void> | null = null;

async function applySchemaPatches(pool: Pool): Promise<void> {
  // Legacy DBs: tables created by older drizzle-kit push may miss newer columns.
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
    ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS used_signals_json text
  `);
  await pool.query(`
    ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS last_hook_topic text
  `);
  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'chat'
  `);

  await pool.query(`
    ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS webhook_verified boolean NOT NULL DEFAULT false
  `);
  await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS metadata jsonb`);

  await pool.query(`CREATE TABLE IF NOT EXISTS ops_credit_grants (
    grant_key text PRIMARY KEY,
    email text NOT NULL,
    credits integer NOT NULL,
    note text,
    user_id integer,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await pool.query(`CREATE TABLE IF NOT EXISTS support_tickets (
    id serial PRIMARY KEY,
    public_id uuid NOT NULL DEFAULT gen_random_uuid(),
    session_id text NOT NULL,
    conversation_id integer,
    status text NOT NULL DEFAULT 'open',
    description text NOT NULL,
    expected_behavior text,
    screenshot_url text,
    n8n_ticket_id integer,
    n8n_public_id text,
    bridge_open boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_public_id_uidx ON support_tickets (public_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS support_tickets_session_id_idx ON support_tickets (session_id)`,
  );

  await pool.query(`CREATE TABLE IF NOT EXISTS support_messages (
    id serial PRIMARY KEY,
    ticket_id integer NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    source text NOT NULL DEFAULT 'app',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS support_messages_ticket_id_idx ON support_messages (ticket_id)`,
  );
}

export async function runDbMigrations(pool: Pool): Promise<void> {
  if (!migrationsReady) {
    migrationsReady = (async () => {
      const before = await listPublicTables(pool);
      const hadUsers = before.includes("users");

      await ensureBootstrapSchema(pool);

      const afterBootstrap = await listPublicTables(pool);
      if (!hadUsers && afterBootstrap.includes("users")) {
        console.info(
          "[db] Bootstrap schema created on empty database",
          JSON.stringify({ tables: afterBootstrap }),
        );
      }

      await applySchemaPatches(pool);
    })().catch((error) => {
      migrationsReady = null;
      throw error;
    });
  }

  await migrationsReady;
}

export { ensureBootstrapSchema, listPublicTables } from "./bootstrap-schema.js";
