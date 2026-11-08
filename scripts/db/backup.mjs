#!/usr/bin/env node
/**
 * Logical backup of AstroBot Postgres (JSON.GZ).
 *
 * Usage:
 *   DATABASE_URL=... node scripts/db/backup.mjs
 *   pnpm db:backup
 *
 * Env:
 *   DATABASE_URL / DATABASE_PRIVATE_URL — required
 *   BACKUP_DIR — output directory (default: ./backups)
 *   BACKUP_KEEP — max files to keep in BACKUP_DIR (default: 14)
 *   BACKUP_HTTP_PUT_URL — optional presigned URL to PUT the gzip file after write
 */
import { createWriteStream } from "node:fs";
import { mkdir, readdir, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import pg from "pg";

const TABLES = [
  "users",
  "contacts",
  "conversations",
  "messages",
  "user_memories",
  "payments",
];

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL?.trim() ||
    process.env.DATABASE_PRIVATE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    ""
  );
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fetchTable(client, table) {
  const res = await client.query(`SELECT * FROM ${table} ORDER BY 1`);
  return res.rows;
}

async function pruneOldBackups(dir, keep) {
  if (!Number.isFinite(keep) || keep < 1) return;
  const files = (await readdir(dir))
    .filter((f) => f.startsWith("astrobot-backup-") && f.endsWith(".json.gz"))
    .sort();
  const extra = files.length - keep;
  for (let i = 0; i < extra; i++) {
    await unlink(path.join(dir, files[i]));
  }
}

async function maybeUpload(filePath) {
  const url = process.env.BACKUP_HTTP_PUT_URL?.trim();
  if (!url) return null;
  const { readFile } = await import("node:fs/promises");
  const body = await readFile(filePath);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(body.byteLength),
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`BACKUP_HTTP_PUT_URL upload failed: ${res.status} ${await res.text()}`);
  }
  return { uploaded: true, status: res.status };
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    console.error("DATABASE_URL (or DATABASE_PRIVATE_URL) is required");
    process.exit(1);
  }

  const backupDir = path.resolve(process.env.BACKUP_DIR?.trim() || path.join(process.cwd(), "backups"));
  const keep = Number.parseInt(process.env.BACKUP_KEEP ?? "14", 10);
  await mkdir(backupDir, { recursive: true });

  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 15_000 });
  await client.connect();

  const counts = {};
  const tables = {};
  try {
    for (const table of TABLES) {
      const exists = await client.query(
        `SELECT to_regclass($1) IS NOT NULL AS ok`,
        [`public.${table}`],
      );
      if (!exists.rows[0]?.ok) {
        tables[table] = [];
        counts[table] = 0;
        continue;
      }
      const rows = await fetchTable(client, table);
      tables[table] = rows;
      counts[table] = rows.length;
    }
  } finally {
    await client.end();
  }

  const payload = {
    format: "astrobot-logical-v1",
    createdAt: new Date().toISOString(),
    tables,
    counts,
  };

  const fileName = `astrobot-backup-${stamp()}.json.gz`;
  const filePath = path.join(backupDir, fileName);
  const json = JSON.stringify(payload);
  await pipeline(Readable.from([json]), createGzip({ level: 9 }), createWriteStream(filePath));

  const st = await stat(filePath);
  await pruneOldBackups(backupDir, keep);
  const upload = await maybeUpload(filePath);

  const summary = {
    ok: true,
    filePath,
    bytes: st.size,
    counts,
    upload,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
