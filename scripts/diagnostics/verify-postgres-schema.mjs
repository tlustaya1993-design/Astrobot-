#!/usr/bin/env node
/**
 * Verify ledger + indexes + CHECK constraints on a real Postgres (e.g. Railway Postgres-Dev).
 * Usage: DATABASE_URL='postgresql://...' node scripts/diagnostics/verify-postgres-schema.mjs
 */
/* eslint-disable no-console */
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const requiredTables = [
  "users",
  "conversations",
  "messages",
  "payments",
  "user_memories",
  "request_ledger",
];

const requiredIndexes = [
  "idx_messages_conversation_created",
  "idx_conversations_session_created",
  "idx_payments_session_created",
  "idx_request_ledger_session_created",
];

const requiredChecks = [
  "users_requests_balance_nonneg",
  "users_requests_used_nonneg",
];

const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 15_000 });

async function main() {
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const names = tables.rows.map((r) => r.table_name);
  const missingTables = requiredTables.filter((t) => !names.includes(t));

  const indexes = await pool.query(`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `);
  const indexNames = indexes.rows.map((r) => r.indexname);
  const missingIndexes = requiredIndexes.filter(
    (i) => !indexNames.some((n) => n === i),
  );

  const checks = await pool.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND contype = 'c'
  `);
  const checkNames = checks.rows.map((r) => r.conname);
  const missingChecks = requiredChecks.filter((c) => !checkNames.includes(c));

  const ledgerUnique = await pool.query(`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'request_ledger' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%idempotency_key%'
  `);

  const ledgerCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'request_ledger'
    ORDER BY ordinal_position
  `);

  const ok =
    missingTables.length === 0 &&
    missingIndexes.length === 0 &&
    missingChecks.length === 0 &&
    ledgerUnique.rows.length > 0;

  console.log(JSON.stringify({
    ok,
    tables: { present: names.filter((n) => requiredTables.includes(n)), missing: missingTables },
    indexes: { missing: missingIndexes },
    checks: { present: checkNames.filter((n) => requiredChecks.includes(n)), missing: missingChecks },
    request_ledger: {
      columns: ledgerCols.rows.map((r) => r.column_name),
      idempotencyUnique: ledgerUnique.rows.length > 0,
    },
  }, null, 2));

  if (!ok) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
