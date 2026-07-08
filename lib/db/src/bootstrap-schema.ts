import type { Pool } from "pg";

/**
 * Idempotent baseline schema for empty Postgres.
 * Historically prod used drizzle-kit push (preDeploy); runDbMigrations only ALTERed columns.
 */
export async function ensureBootstrapSchema(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    session_id text NOT NULL UNIQUE,
    email text UNIQUE,
    password_hash text,
    name text,
    birth_date text,
    birth_time text,
    birth_time_unknown boolean NOT NULL DEFAULT false,
    birth_place text,
    birth_lat double precision,
    birth_lng double precision,
    avatar_json text,
    gender text,
    language text DEFAULT 'ru',
    onboarding_done boolean NOT NULL DEFAULT false,
    tone_preferred_depth text,
    tone_preferred_style text,
    tone_emotional_sensitivity text,
    tone_familiarity_level text,
    requests_balance integer NOT NULL DEFAULT 0,
    requests_used integer NOT NULL DEFAULT 0,
    is_test boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_requests_balance_nonneg CHECK (requests_balance >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE users ADD CONSTRAINT users_requests_used_nonneg CHECK (requests_used >= 0);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  await pool.query(`CREATE TABLE IF NOT EXISTS contacts (
    id serial PRIMARY KEY,
    session_id text NOT NULL,
    name text NOT NULL,
    relation text,
    birth_date text NOT NULL,
    birth_time text,
    birth_place text,
    birth_lat double precision,
    birth_lng double precision,
    avatar_json text,
    avatar_hair_style text DEFAULT 'medium',
    avatar_hair_color text DEFAULT '#1c1c2e',
    avatar_robe_color text DEFAULT '#3730A3',
    avatar_eye_color text DEFAULT '#3B82F6',
    created_at timestamp NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS conversations (
    id serial PRIMARY KEY,
    session_id text NOT NULL,
    title text NOT NULL,
    contact_id integer,
    contact_extended_mode boolean NOT NULL DEFAULT false,
    used_signals_json text,
    last_hook_topic text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS messages (
    id serial PRIMARY KEY,
    conversation_id integer NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'chat',
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS user_memories (
    id serial PRIMARY KEY,
    session_id text NOT NULL,
    content text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id serial PRIMARY KEY,
    session_id text NOT NULL,
    provider text NOT NULL DEFAULT 'yookassa',
    provider_payment_id text NOT NULL UNIQUE,
    app_payment_id text NOT NULL UNIQUE,
    package_code text NOT NULL,
    credits_granted integer NOT NULL,
    amount_rub text NOT NULL,
    currency text NOT NULL DEFAULT 'RUB',
    status text NOT NULL DEFAULT 'pending',
    description text,
    metadata_json text,
    credits_applied_at timestamptz,
    refunded_at timestamptz,
    provider_refund_id text,
    webhook_verified boolean NOT NULL DEFAULT false,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS request_ledger (
    id serial PRIMARY KEY,
    session_id text NOT NULL,
    user_id integer,
    type text NOT NULL,
    amount integer NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    ref_type text,
    ref_id text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_session_created
    ON conversations (session_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_session_created
    ON payments (session_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_request_ledger_session_created
    ON request_ledger (session_id, created_at DESC)
  `);
}

/** For logs / readiness: which core tables exist. */
export async function listPublicTables(pool: Pool): Promise<string[]> {
  const result = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return result.rows.map((r) => r.table_name);
}
