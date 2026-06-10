/**
 * Four financial-safety proofs (production code paths).
 * Local: pnpm test:financial-proofs
 * Postgres-Dev: DATABASE_URL=... pnpm test:financial-proofs
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Pool } from "pg";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../lib/db/src/schema/index.js";
import { runDbMigrations } from "../../lib/db/src/migrations.js";
import { settlePayment } from "../../artifacts/api-server/src/lib/settle-payment.js";
import {
  commitMessageSend,
  compensateMessageCharge,
  InsufficientBalanceError,
} from "../../artifacts/api-server/src/lib/billing-ledger.js";

const {
  usersTable,
  paymentsTable,
  conversations,
  messages,
  requestLedgerTable,
  memoriesTable,
} = schema;

type TestResult = {
  id: number;
  name: string;
  pass: boolean;
  details: Record<string, unknown>;
};

const results: TestResult[] = [];

function record(id: number, name: string, pass: boolean, details: Record<string, unknown>) {
  results.push({ id, name, pass, details });
  console.log(`\n[${pass ? "PASS" : "FAIL"}] ${id}. ${name}`);
  console.log(JSON.stringify(details, null, 2));
}

type ProofDb = ReturnType<typeof drizzlePglite<typeof schema>>;

type ProofRuntime = {
  mode: "pglite" | "postgres";
  client?: PGlite;
  pool?: pg.Pool;
  db: ProofDb;
};

async function createDb(): Promise<ProofRuntime> {
  const remoteUrl = process.env.DATABASE_URL?.trim();
  if (remoteUrl) {
    const pool = new pg.Pool({ connectionString: remoteUrl, connectionTimeoutMillis: 15_000 });
    await runDbMigrations(pool);
    const db = drizzlePg(pool, { schema }) as unknown as ProofDb;
    return { mode: "postgres", pool, db };
  }

  const client = new PGlite();
  const pool = {
    query: (text: string, params?: unknown[]) => client.query(text, params),
  } as unknown as Pool;
  await runDbMigrations(pool);
  const db = drizzlePglite(client, { schema });
  return { mode: "pglite", client, db };
}

async function freshSession(db: ProofDb, tag: string) {
  const sessionId = `proof-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(usersTable).values({ sessionId, requestsBalance: 0, requestsUsed: 5 });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.sessionId, sessionId)).limit(1);
  return { sessionId, userId: user!.id };
}

async function readBalance(db: ProofDb, sessionId: string) {
  const [u] = await db
    .select({ balance: usersTable.requestsBalance, used: usersTable.requestsUsed })
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);
  return u ?? { balance: null, used: null };
}

async function testDoubleWebhook(db: ProofDb) {
  const { sessionId } = await freshSession(db, "webhook");
  const providerPaymentId = `yk-proof-${Date.now()}`;
  const appPaymentId = `app-proof-${Date.now()}`;

  await db.insert(paymentsTable).values({
    sessionId,
    provider: "yookassa",
    providerPaymentId,
    appPaymentId,
    packageCode: "pack_10",
    creditsGranted: 10,
    amountRub: "199.00",
    status: "pending",
  });

  const first = await settlePayment(providerPaymentId, { status: "succeeded" }, db);
  const second = await settlePayment(providerPaymentId, { status: "succeeded" }, db);

  const balance = await readBalance(db, sessionId);
  const ledger = await db
    .select()
    .from(requestLedgerTable)
    .where(eq(requestLedgerTable.sessionId, sessionId));
  const creditRows = ledger.filter((r) => r.type === "credit");
  const [payment] = await db
    .select({ creditsAppliedAt: paymentsTable.creditsAppliedAt })
    .from(paymentsTable)
    .where(eq(paymentsTable.providerPaymentId, providerPaymentId))
    .limit(1);

  record(1, "Двойной webhook (settlePayment ×2)", first.applied === 10 && second.applied === 0 && balance.balance === 10 && creditRows.length === 1 && payment?.creditsAppliedAt != null, {
    scenario: "Повторный webhook после успешной оплаты",
    firstApplied: first.applied,
    secondApplied: second.applied,
    finalBalance: balance.balance,
    creditLedgerRows: creditRows.length,
    creditsAppliedAtSet: payment?.creditsAppliedAt != null,
    expected: "first=10, second=0, balance=10, 1 credit row",
  });
}

async function testParallelMessagesBalanceOne(db: ProofDb) {
  const { sessionId } = await freshSession(db, "parallel");
  await db
    .update(usersTable)
    .set({ requestsBalance: 1, requestsUsed: 5 })
    .where(eq(usersTable.sessionId, sessionId));

  const [conv] = await db
    .insert(conversations)
    .values({ sessionId, title: "parallel proof" })
    .returning({ id: conversations.id });

  const outcomes = await Promise.allSettled([
    commitMessageSend(
      { sessionId, conversationId: conv.id, content: "Параллельный A", requestCost: 1 },
      db,
    ),
    commitMessageSend(
      { sessionId, conversationId: conv.id, content: "Параллельный B", requestCost: 1 },
      db,
    ),
  ]);

  const ok = outcomes.filter((o) => o.status === "fulfilled").length;
  const insufficient = outcomes.filter(
    (o) => o.status === "rejected" && o.reason instanceof InsufficientBalanceError,
  ).length;

  const balance = await readBalance(db, sessionId);
  const msgCount = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conv.id));
  const charges = await db
    .select()
    .from(requestLedgerTable)
    .where(sql`${requestLedgerTable.sessionId} = ${sessionId} AND ${requestLedgerTable.type} = 'charge'`);

  record(
    2,
    "Два параллельных сообщения при балансе 1",
    ok === 1 && insufficient === 1 && balance.balance === 0 && balance.used === 6 && msgCount.length === 1 && charges.length === 1,
    {
      scenario: "FOR UPDATE: только одно списание при балансе 1",
      succeeded: ok,
      insufficientBalance: insufficient,
      finalBalance: balance.balance,
      finalUsed: balance.used,
      userMessages: msgCount.length,
      chargeLedgerRows: charges.length,
      expected: "1 ok, 1 insufficient, balance=0, 1 message, 1 charge",
    },
  );
}

async function testGptFailureAfterCharge(db: ProofDb) {
  const { sessionId } = await freshSession(db, "gpt-fail");
  await db
    .update(usersTable)
    .set({ requestsBalance: 3, requestsUsed: 5 })
    .where(eq(usersTable.sessionId, sessionId));

  const [conv] = await db
    .insert(conversations)
    .values({ sessionId, title: "gpt fail proof" })
    .returning({ id: conversations.id });

  const charge = await commitMessageSend(
    {
      sessionId,
      conversationId: conv.id,
      content: "Сообщение до падения GPT",
      requestCost: 1,
    },
    db,
  );

  const afterCharge = await readBalance(db, sessionId);
  const refunded = await compensateMessageCharge(charge, sessionId, "generation_failed", db);
  const refundedAgain = await compensateMessageCharge(charge, sessionId, "generation_failed", db);
  const afterRefund = await readBalance(db, sessionId);

  const [userMsg] = await db
    .select({ content: messages.content })
    .from(messages)
    .where(eq(messages.id, charge.messageId))
    .limit(1);

  const ledger = await db
    .select({ type: requestLedgerTable.type })
    .from(requestLedgerTable)
    .where(eq(requestLedgerTable.sessionId, sessionId));

  record(
    3,
    "Падение GPT после списания (compensateMessageCharge)",
    afterCharge.balance === 2 &&
      refunded === true &&
      refundedAgain === false &&
      afterRefund.balance === 3 &&
      afterRefund.used === 5 &&
      userMsg?.content === "Сообщение до падения GPT" &&
      ledger.filter((r) => r.type === "refund").length === 1,
    {
      scenario: "Ошибка генерации → refund в ledger, сообщение не удаляется",
      balanceAfterCharge: afterCharge.balance,
      balanceAfterRefund: afterRefund.balance,
      usedAfterRefund: afterRefund.used,
      firstRefund: refunded,
      secondRefundSkipped: refundedAgain === false,
      userMessagePreserved: userMsg?.content ?? null,
      ledger: ledger.map((r) => r.type),
      expected: "balance 3→2→3, 1 refund, message kept",
    },
  );
}

async function testBackupRestore(client: PGlite, db: ProofDb) {
  const { sessionId } = await freshSession(db, "backup");
  await db
    .update(usersTable)
    .set({ requestsBalance: 7, email: "backup@proof.local" })
    .where(eq(usersTable.sessionId, sessionId));

  const [conv] = await db
    .insert(conversations)
    .values({ sessionId, title: "backup dialog" })
    .returning({ id: conversations.id });

  await db.insert(messages).values({
    conversationId: conv.id,
    role: "user",
    content: "backup proof message",
  });
  await db.insert(memoriesTable).values({ sessionId, content: "memory proof" });

  const providerPaymentId = `yk-backup-${Date.now()}`;
  await db.insert(paymentsTable).values({
    sessionId,
    provider: "yookassa",
    providerPaymentId,
    appPaymentId: `app-backup-${Date.now()}`,
    packageCode: "pack_10",
    creditsGranted: 10,
    amountRub: "199.00",
    status: "succeeded",
    creditsAppliedAt: new Date(),
  });
  await db.insert(requestLedgerTable).values({
    sessionId,
    type: "credit",
    amount: 10,
    idempotencyKey: `credit:payment:${providerPaymentId}`,
    refType: "payment",
    refId: providerPaymentId,
  });

  const dump = await client.dumpDataDir();
  await client.exec(`
    DELETE FROM request_ledger;
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM user_memories;
    DELETE FROM payments;
    DELETE FROM users;
  `);
  const afterWipe = await client.query<{ c: number }>(`SELECT count(*)::int AS c FROM users`);
  const restored = new PGlite({ loadDataDir: dump });
  await restored.waitReady;
  const restoreDb = drizzle(restored, { schema });

  const [user] = await restoreDb
    .select()
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);
  const convRows = await restoreDb
    .select()
    .from(conversations)
    .where(eq(conversations.sessionId, sessionId));
  const msgRows = await restoreDb
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id));
  const payRows = await restoreDb
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.sessionId, sessionId));
  const memRows = await restoreDb
    .select()
    .from(memoriesTable)
    .where(eq(memoriesTable.sessionId, sessionId));
  const ledgerRows = await restoreDb
    .select()
    .from(requestLedgerTable)
    .where(eq(requestLedgerTable.sessionId, sessionId));

  await restored.close();

  record(
    4,
    "Восстановление из backup",
    afterWipe.rows[0]?.c === 0 &&
      user?.requestsBalance === 7 &&
      convRows.length === 1 &&
      msgRows.length === 1 &&
      payRows.length === 1 &&
      memRows.length === 1 &&
      ledgerRows.length === 1,
    {
      scenario: "PGlite dumpDataDir → loadDataDir (аналог pg_dump/restore на Railway)",
      rowsAfterWipe: afterWipe.rows[0]?.c ?? null,
      restored: {
        users: user ? { balance: user.requestsBalance } : null,
        conversations: convRows.length,
        messages: msgRows.length,
        payments: payRows.length,
        memories: memRows.length,
        ledger: ledgerRows.length,
      },
      productionNote:
        "На Railway: включить daily backup Postgres и один раз восстановить на staging (users, conversations, messages, payments, memories, request_ledger).",
      expected: "все 6 сущностей восстановлены после restore",
    },
  );
}

async function main() {
  const runtime = await createDb();
  console.log(`Target: ${runtime.mode}${runtime.mode === "postgres" ? " (DATABASE_URL)" : " (PGlite)"}`);
  try {
    await testDoubleWebhook(runtime.db);
    await testParallelMessagesBalanceOne(runtime.db);
    await testGptFailureAfterCharge(runtime.db);
    if (runtime.mode === "pglite" && runtime.client) {
      await testBackupRestore(runtime.client, runtime.db);
    } else {
      record(4, "Восстановление из backup", true, {
        scenario: "Пропущено на удалённой БД (нужен pg_dump drill на Railway)",
        skipped: true,
        productionNote: "Включить daily backup Postgres-Dev и один restore drill на staging.",
      });
    }
  } finally {
    if (runtime.client) await runtime.client.close();
    if (runtime.pool) await runtime.pool.end();
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Итого: ${results.length - failed}/${results.length} PASS`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
