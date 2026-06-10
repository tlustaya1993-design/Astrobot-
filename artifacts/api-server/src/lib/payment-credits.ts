import { and, eq, isNull, sql } from "drizzle-orm";
import { db as appDb, paymentsTable, usersTable } from "@workspace/db";

type AppDb = typeof appDb;

export async function applyCreditsIfNeededByPaymentId(
  paymentId: number,
  database: AppDb = appDb,
): Promise<number> {
  return database.transaction(async (tx) => {
    const now = new Date();
    const [claimed] = await tx
      .update(paymentsTable)
      .set({ creditsAppliedAt: now, updatedAt: now })
      .where(
        and(
          eq(paymentsTable.id, paymentId),
          eq(paymentsTable.status, "succeeded"),
          isNull(paymentsTable.creditsAppliedAt),
        ),
      )
      .returning({
        sessionId: paymentsTable.sessionId,
        creditsGranted: paymentsTable.creditsGranted,
      });

    if (!claimed) return 0;

    const updated = await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`${usersTable.requestsBalance} + ${claimed.creditsGranted}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, claimed.sessionId))
      .returning({ id: usersTable.id });

    if (updated.length === 0) {
      throw new Error(`Cannot apply credits for payment ${paymentId}: user session not found`);
    }

    return claimed.creditsGranted;
  });
}
