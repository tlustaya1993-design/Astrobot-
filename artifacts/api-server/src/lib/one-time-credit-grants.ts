import type { Pool } from "pg";
import { logger } from "./logger.js";

/**
 * Idempotent support grants applied once on API boot after migrations.
 * Safe across redeploys: grant_key is unique in ops_credit_grants.
 */
const PENDING_ONE_TIME_CREDIT_GRANTS = [
  {
    key: "2026-11-10-alena4e6ka-seznam-100",
    email: "alena4e6ka@seznam.cz",
    credits: 100,
    note: "Support grant: 100 free requests",
  },
] as const;

export async function applyOneTimeCreditGrants(pool: Pool): Promise<void> {
  for (const grant of PENDING_ONE_TIME_CREDIT_GRANTS) {
    const email = grant.email.trim().toLowerCase();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query<{ id: number; requests_balance: number }>(
        `SELECT id, requests_balance
         FROM users
         WHERE lower(email) = $1
         LIMIT 1
         FOR UPDATE`,
        [email],
      );
      const user = userResult.rows[0];
      if (!user) {
        await client.query("ROLLBACK");
        logger.warn(
          { grantKey: grant.key, email },
          "One-time credit grant skipped: user not found (will retry on next boot)",
        );
        continue;
      }

      const claim = await client.query<{ grant_key: string }>(
        `INSERT INTO ops_credit_grants (grant_key, email, credits, note, user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (grant_key) DO NOTHING
         RETURNING grant_key`,
        [grant.key, email, grant.credits, grant.note, user.id],
      );
      if ((claim.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        logger.info(
          { grantKey: grant.key, email },
          "One-time credit grant already applied",
        );
        continue;
      }

      const updated = await client.query<{ requests_balance: number }>(
        `UPDATE users
         SET requests_balance = requests_balance + $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING requests_balance`,
        [grant.credits, user.id],
      );

      await client.query("COMMIT");
      logger.info(
        {
          grantKey: grant.key,
          email,
          credits: grant.credits,
          requestsBalance: updated.rows[0]?.requests_balance,
        },
        "One-time credit grant applied",
      );
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback errors
      }
      logger.error({ err, grantKey: grant.key, email }, "One-time credit grant failed");
    } finally {
      client.release();
    }
  }
}
