import { and, eq, sql } from "drizzle-orm";
import {
  db,
  messages,
  requestLedgerTable,
  usersTable,
} from "@workspace/db";
import {
  canAffordRequest,
  getPaidUnitsForCharge,
  isUnlimitedEmail,
} from "./billing-policy.js";
import { logger } from "./logger.js";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("insufficient_balance");
    this.name = "InsufficientBalanceError";
  }
}

export type MessageChargeCommit = {
  messageId: number;
  requestCost: number;
  paidUnits: number;
  freeUnits: number;
  unlimited: boolean;
};

/**
 * Atomically: lock user → afford check → insert user message → debit balance → ledger charge.
 */
type DbClient = Pick<typeof db, "transaction">;

export async function commitMessageSend(
  params: {
    sessionId: string;
    conversationId: number;
    content: string;
    requestCost: number;
  },
  database: DbClient = db,
): Promise<MessageChargeCommit> {
  return database.transaction(async (tx) => {
    await tx.insert(usersTable).values({ sessionId: params.sessionId }).onConflictDoNothing();

    const [owner] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.sessionId, params.sessionId))
      .for("update")
      .limit(1);

    if (!owner) throw new Error("user_not_found");

    if (
      !canAffordRequest(
        owner.requestsUsed,
        owner.requestsBalance,
        params.requestCost,
        owner.email,
      )
    ) {
      throw new InsufficientBalanceError();
    }

    const [inserted] = await tx
      .insert(messages)
      .values({
        conversationId: params.conversationId,
        role: "user",
        content: params.content,
      })
      .returning({ id: messages.id });

    const messageId = inserted.id;
    const unlimited = isUnlimitedEmail(owner.email);
    const paidUnits = getPaidUnitsForCharge(
      owner.requestsUsed,
      params.requestCost,
      owner.email,
    );
    const freeUnits = unlimited ? params.requestCost : params.requestCost - paidUnits;

    if (unlimited) {
      await tx
        .update(usersTable)
        .set({
          requestsUsed: sql`${usersTable.requestsUsed} + ${params.requestCost}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.sessionId, params.sessionId));
    } else {
      const updated = await tx
        .update(usersTable)
        .set({
          requestsBalance: sql`${usersTable.requestsBalance} - ${paidUnits}`,
          requestsUsed: sql`${usersTable.requestsUsed} + ${params.requestCost}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(usersTable.sessionId, params.sessionId),
            paidUnits > 0
              ? sql`${usersTable.requestsBalance} >= ${paidUnits}`
              : sql`true`,
          ),
        )
        .returning({ id: usersTable.id });

      if (updated.length === 0) throw new InsufficientBalanceError();
    }

    await tx.insert(requestLedgerTable).values({
      sessionId: params.sessionId,
      userId: owner.id,
      type: "charge",
      amount: params.requestCost,
      idempotencyKey: `charge:msg:${messageId}`,
      refType: "message",
      refId: String(messageId),
      metadata: {
        conversationId: params.conversationId,
        paidUnits,
        freeUnits,
        unlimited,
      },
    });

    logger.info(
      {
        event: "billing.charge",
        sessionId: params.sessionId,
        userId: owner.id,
        messageId,
        conversationId: params.conversationId,
        requestCost: params.requestCost,
        paidUnits,
        freeUnits,
        unlimited,
      },
      "Request charge committed",
    );

    return {
      messageId,
      requestCost: params.requestCost,
      paidUnits,
      freeUnits,
      unlimited,
    };
  });
}

/** Compensating ledger entry after failed generation — idempotent per message. */
export async function compensateMessageCharge(
  charge: MessageChargeCommit,
  sessionId: string,
  reason: string,
  database: DbClient = db,
): Promise<boolean> {
  if (charge.unlimited) return false;

  try {
    return await database.transaction(async (tx) => {
      const refundKey = `refund:msg:${charge.messageId}`;
      const [existing] = await tx
        .select({ id: requestLedgerTable.id })
        .from(requestLedgerTable)
        .where(eq(requestLedgerTable.idempotencyKey, refundKey))
        .limit(1);
      if (existing) return false;

      const [owner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.sessionId, sessionId))
        .for("update")
        .limit(1);
      if (!owner) return false;

      await tx
        .update(usersTable)
        .set({
          requestsBalance: sql`${usersTable.requestsBalance} + ${charge.paidUnits}`,
          requestsUsed: sql`GREATEST(0, ${usersTable.requestsUsed} - ${charge.requestCost})`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.sessionId, sessionId));

      await tx.insert(requestLedgerTable).values({
        sessionId,
        userId: owner.id,
        type: "refund",
        amount: charge.requestCost,
        idempotencyKey: refundKey,
        refType: "message",
        refId: String(charge.messageId),
        metadata: { paidUnits: charge.paidUnits, reason },
      });

      logger.info(
        {
          event: "billing.refund",
          sessionId,
          userId: owner.id,
          messageId: charge.messageId,
          requestCost: charge.requestCost,
          paidUnits: charge.paidUnits,
          reason,
        },
        "Message charge compensated",
      );

      return true;
    });
  } catch (err) {
    logger.error(
      { err, sessionId, messageId: charge.messageId, event: "billing.refund_failed" },
      "Failed to compensate message charge",
    );
    return false;
  }
}
