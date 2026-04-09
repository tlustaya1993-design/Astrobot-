import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { FREE_REQUESTS_LIMIT, isUnlimitedEmail } from "../lib/billing-policy.js";
import { getYookassaPayment } from "../lib/yookassa.js";

const router: IRouter = Router();

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails().includes(email.trim().toLowerCase());
}

function requireAdmin(req: { authEmail?: string }, res: { status: (n: number) => { json: (x: unknown) => void } }): boolean {
  if (!isAdminEmail(req.authEmail)) {
    res.status(403).json({ error: "Доступ только для администратора" });
    return false;
  }
  return true;
}

async function applyCreditsIfNeededByPaymentId(paymentId: number): Promise<number> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, paymentId))
      .limit(1);

    if (!locked) return 0;
    if (locked.status !== "succeeded") return 0;
    if (locked.creditsAppliedAt) return 0;

    await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`${usersTable.requestsBalance} + ${locked.creditsGranted}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, locked.sessionId));

    await tx
      .update(paymentsTable)
      .set({ creditsAppliedAt: new Date(), updatedAt: new Date() })
      .where(eq(paymentsTable.id, paymentId));

    return locked.creditsGranted;
  });
}

router.get("/me", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, email: req.authEmail });
});

router.get("/users", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const rawEmail = typeof req.query.email === "string" ? req.query.email : "";
  const email = rawEmail.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "email обязателен" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.sessionId, user.sessionId))
    .orderBy(sql`${paymentsTable.createdAt} DESC`)
    .limit(20);

  const used = Math.max(0, user.requestsUsed ?? 0);
  const balance = Math.max(0, user.requestsBalance ?? 0);
  const freeRemaining = Math.max(0, FREE_REQUESTS_LIMIT - used);
  const unlimited = isUnlimitedEmail(user.email);

  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      sessionId: user.sessionId,
      requestsUsed: used,
      requestsBalance: balance,
      freeRemaining,
      isUnlimited: unlimited,
      remaining: unlimited ? Number.MAX_SAFE_INTEGER : freeRemaining + balance,
      updatedAt: user.updatedAt,
    },
    payments,
  });
});

router.post("/users/grant-credits", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const credits = Number(req.body?.credits);
  if (!email || !Number.isInteger(credits) || credits <= 0 || credits > 10000) {
    res.status(400).json({ error: "Передайте email и корректное число credits (1..10000)" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      requestsBalance: sql`${usersTable.requestsBalance} + ${credits}`,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      sessionId: usersTable.sessionId,
      requestsUsed: usersTable.requestsUsed,
      requestsBalance: usersTable.requestsBalance,
      updatedAt: usersTable.updatedAt,
    });

  res.json({ ok: true, user: updated, granted: credits });
});

router.post("/users/reconcile", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email) {
    res.status(400).json({ error: "email обязателен" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Пользователь не найден" });
    return;
  }

  const recentPayments = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.sessionId, user.sessionId), eq(paymentsTable.provider, "yookassa")))
    .orderBy(sql`${paymentsTable.createdAt} DESC`)
    .limit(5);

  let applied = 0;
  for (const payment of recentPayments) {
    applied += await applyCreditsIfNeededByPaymentId(payment.id);
    if (payment.status !== "succeeded" && payment.providerPaymentId) {
      try {
        const providerPayment = await getYookassaPayment(payment.providerPaymentId);
        if (providerPayment?.status) {
          await db
            .update(paymentsTable)
            .set({
              status: providerPayment.status,
              metadata: providerPayment as unknown as Record<string, unknown>,
              updatedAt: new Date(),
            })
            .where(eq(paymentsTable.id, payment.id));
          if (providerPayment.status === "succeeded") {
            applied += await applyCreditsIfNeededByPaymentId(payment.id);
          }
        }
      } catch {
        // ignore provider sync errors; operator can retry
      }
    }
  }

  const [updatedUser] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      sessionId: usersTable.sessionId,
      requestsUsed: usersTable.requestsUsed,
      requestsBalance: usersTable.requestsBalance,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);

  res.json({ ok: true, applied, user: updatedUser });
});

export default router;

