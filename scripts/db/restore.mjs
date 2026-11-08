#!/usr/bin/env node
/**
 * Restore AstroBot logical backup (JSON.GZ from scripts/db/backup.mjs).
 *
 * Usage:
 *   DATABASE_URL=... node scripts/db/restore.mjs ./backups/astrobot-backup-....json.gz --yes
 *
 * SAFETY: refuses to run without --yes. Prefer restoring into an empty or staging DB first.
 * Remaps serial contact/conversation ids so messages keep relationships.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import pg from "pg";

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_PRIVATE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    ""
  );
}

async function readBackup(filePath) {
  const raw = await readFile(filePath);
  if (filePath.endsWith(".gz")) {
    return JSON.parse(gunzipSync(raw).toString("utf8"));
  }
  return JSON.parse(raw.toString("utf8"));
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes("--yes");
  const fileArg = args.find((a) => !a.startsWith("--"));
  if (!fileArg) {
    console.error("Usage: node scripts/db/restore.mjs <backup.json.gz> --yes");
    process.exit(1);
  }
  if (!yes) {
    console.error("Refusing to restore without --yes");
    process.exit(1);
  }

  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  const backup = await readBackup(filePath);
  if (backup.format !== "astrobot-logical-v1") {
    console.error("Unsupported backup format:", backup.format);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();

  const contactIdMap = new Map();
  const conversationIdMap = new Map();

  try {
    await client.query("BEGIN");

    for (const row of backup.tables.users || []) {
      await client.query(
        `INSERT INTO users (
          session_id, email, password_hash, name, birth_date, birth_time, birth_time_unknown,
          birth_place, birth_lat, birth_lng, avatar_json, gender, language, onboarding_done,
          tone_preferred_depth, tone_preferred_style, tone_emotional_sensitivity, tone_familiarity_level,
          requests_balance, requests_used, is_test, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,COALESCE($7,false),
          $8,$9,$10,$11,$12,COALESCE($13,'ru'),COALESCE($14,false),
          $15,$16,$17,$18,
          COALESCE($19,0),COALESCE($20,0),COALESCE($21,false),COALESCE($22,NOW()),COALESCE($23,NOW())
        )
        ON CONFLICT (session_id) DO UPDATE SET
          email = COALESCE(EXCLUDED.email, users.email),
          password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
          name = COALESCE(EXCLUDED.name, users.name),
          birth_date = COALESCE(EXCLUDED.birth_date, users.birth_date),
          birth_time = COALESCE(EXCLUDED.birth_time, users.birth_time),
          birth_time_unknown = EXCLUDED.birth_time_unknown,
          birth_place = COALESCE(EXCLUDED.birth_place, users.birth_place),
          birth_lat = COALESCE(EXCLUDED.birth_lat, users.birth_lat),
          birth_lng = COALESCE(EXCLUDED.birth_lng, users.birth_lng),
          avatar_json = COALESCE(EXCLUDED.avatar_json, users.avatar_json),
          gender = COALESCE(EXCLUDED.gender, users.gender),
          language = COALESCE(EXCLUDED.language, users.language),
          onboarding_done = users.onboarding_done OR EXCLUDED.onboarding_done,
          tone_preferred_depth = COALESCE(EXCLUDED.tone_preferred_depth, users.tone_preferred_depth),
          tone_preferred_style = COALESCE(EXCLUDED.tone_preferred_style, users.tone_preferred_style),
          tone_emotional_sensitivity = COALESCE(EXCLUDED.tone_emotional_sensitivity, users.tone_emotional_sensitivity),
          tone_familiarity_level = COALESCE(EXCLUDED.tone_familiarity_level, users.tone_familiarity_level),
          requests_balance = GREATEST(users.requests_balance, EXCLUDED.requests_balance),
          requests_used = GREATEST(users.requests_used, EXCLUDED.requests_used),
          is_test = users.is_test OR EXCLUDED.is_test,
          updated_at = NOW()
        `,
        [
          row.session_id,
          row.email,
          row.password_hash,
          row.name,
          row.birth_date,
          row.birth_time,
          row.birth_time_unknown,
          row.birth_place,
          row.birth_lat,
          row.birth_lng,
          row.avatar_json,
          row.gender,
          row.language,
          row.onboarding_done,
          row.tone_preferred_depth,
          row.tone_preferred_style,
          row.tone_emotional_sensitivity,
          row.tone_familiarity_level,
          row.requests_balance,
          row.requests_used,
          row.is_test,
          row.created_at,
          row.updated_at,
        ],
      );
    }

    for (const row of backup.tables.contacts || []) {
      const inserted = await client.query(
        `INSERT INTO contacts (
          session_id, name, relation, birth_date, birth_time, birth_place, birth_lat, birth_lng,
          avatar_json, avatar_hair_style, avatar_hair_color, avatar_robe_color, avatar_eye_color,
          created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,
          COALESCE($14,NOW())
        ) RETURNING id`,
        [
          row.session_id,
          row.name,
          row.relation,
          row.birth_date,
          row.birth_time,
          row.birth_place,
          row.birth_lat,
          row.birth_lng,
          row.avatar_json,
          row.avatar_hair_style ?? "medium",
          row.avatar_hair_color ?? "#1c1c2e",
          row.avatar_robe_color ?? "#3730A3",
          row.avatar_eye_color ?? "#3B82F6",
          row.created_at,
        ],
      );
      contactIdMap.set(row.id, inserted.rows[0].id);
    }

    for (const row of backup.tables.conversations || []) {
      const mappedContact =
        row.contact_id == null ? null : (contactIdMap.get(row.contact_id) ?? null);
      const inserted = await client.query(
        `INSERT INTO conversations (
          session_id, title, contact_id, contact_extended_mode, used_signals_json, last_hook_topic, created_at
        ) VALUES ($1,$2,$3,COALESCE($4,false),$5,$6,COALESCE($7,NOW()))
        RETURNING id`,
        [
          row.session_id,
          row.title,
          mappedContact,
          row.contact_extended_mode,
          row.used_signals_json,
          row.last_hook_topic,
          row.created_at,
        ],
      );
      conversationIdMap.set(row.id, inserted.rows[0].id);
    }

    for (const row of backup.tables.messages || []) {
      const convId = conversationIdMap.get(row.conversation_id);
      if (!convId) continue;
      await client.query(
        `INSERT INTO messages (conversation_id, role, content, message_type, created_at)
         VALUES ($1,$2,$3,COALESCE($4,'chat'),COALESCE($5,NOW()))`,
        [convId, row.role, row.content, row.message_type, row.created_at],
      );
    }

    for (const row of backup.tables.user_memories || []) {
      await client.query(
        `INSERT INTO user_memories (session_id, content, created_at, updated_at)
         VALUES ($1,$2,COALESCE($3,NOW()),COALESCE($4,NOW()))`,
        [row.session_id, row.content, row.created_at, row.updated_at],
      );
    }

    for (const row of backup.tables.payments || []) {
      await client.query(
        `INSERT INTO payments (
          session_id, provider, provider_payment_id, app_payment_id, package_code, credits_granted,
          amount_rub, currency, status, description, metadata_json, credits_applied_at, refunded_at,
          provider_refund_id, webhook_verified, metadata, created_at, updated_at
        ) VALUES (
          $1,COALESCE($2,'yookassa'),$3,$4,$5,$6,
          $7,COALESCE($8,'RUB'),$9,$10,$11,$12,$13,
          $14,COALESCE($15,false),$16,COALESCE($17,NOW()),COALESCE($18,NOW())
        )
        ON CONFLICT (provider_payment_id) DO NOTHING`,
        [
          row.session_id,
          row.provider,
          row.provider_payment_id,
          row.app_payment_id,
          row.package_code,
          row.credits_granted,
          row.amount_rub,
          row.currency,
          row.status,
          row.description,
          row.metadata_json,
          row.credits_applied_at,
          row.refunded_at,
          row.provider_refund_id,
          row.webhook_verified,
          row.metadata,
          row.created_at,
          row.updated_at,
        ],
      );
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          ok: true,
          restoredFrom: filePath,
          users: (backup.tables.users || []).length,
          contacts: contactIdMap.size,
          conversations: conversationIdMap.size,
          messages: (backup.tables.messages || []).length,
          payments: (backup.tables.payments || []).length,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
