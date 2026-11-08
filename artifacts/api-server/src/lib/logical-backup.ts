import type { Pool } from "pg";
import { gzipSync } from "node:zlib";

export const LOGICAL_BACKUP_TABLES = [
  "users",
  "contacts",
  "conversations",
  "messages",
  "user_memories",
  "payments",
] as const;

export type LogicalBackupPayload = {
  format: "astrobot-logical-v1";
  createdAt: string;
  tables: Record<string, unknown[]>;
  counts: Record<string, number>;
};

export async function createLogicalBackupPayload(pool: Pool): Promise<LogicalBackupPayload> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of LOGICAL_BACKUP_TABLES) {
    const exists = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [
      `public.${table}`,
    ]);
    if (!exists.rows[0]?.ok) {
      tables[table] = [];
      counts[table] = 0;
      continue;
    }
    const res = await pool.query(`SELECT * FROM ${table} ORDER BY 1`);
    tables[table] = res.rows;
    counts[table] = res.rows.length;
  }

  return {
    format: "astrobot-logical-v1",
    createdAt: new Date().toISOString(),
    tables,
    counts,
  };
}

export function gzipLogicalBackup(payload: LogicalBackupPayload): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 });
}
