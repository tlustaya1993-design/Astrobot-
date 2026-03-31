import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "astrobot-dev-secret-change-in-production";
const SALT_ROUNDS = 10;
const TOKEN_TTL = "365d";

function signToken(sessionId: string, email: string): string {
  return jwt.sign({ sessionId, email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// POST /auth/register
// Body: { email, password, sessionId? }
// If sessionId is provided, links the existing anonymous account to the new credentials.
router.post("/register", async (req, res) => {
  const { email, password, sessionId: existingSessionId } = req.body as {
    email?: string;
    password?: string;
    sessionId?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "email и пароль обязательны" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Пароль должен быть не менее 6 символов" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();

  // Check if email already taken
  const [existing] = await db
    .select({ id: usersTable.id, sessionId: usersTable.sessionId })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Этот email уже зарегистрирован" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  if (existingSessionId) {
    // Migrate anonymous session → registered account
    const [anon] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.sessionId, existingSessionId))
      .limit(1);

    if (anon) {
      const [updated] = await db
        .update(usersTable)
        .set({ email: normalizedEmail, passwordHash })
        .where(eq(usersTable.sessionId, existingSessionId))
        .returning({ sessionId: usersTable.sessionId, email: usersTable.email });

      const token = signToken(updated.sessionId, normalizedEmail);
      res.json({ token, sessionId: updated.sessionId, email: normalizedEmail });
      return;
    }
  }

  // Create brand new user
  const newSessionId = randomUUID();
  await db.insert(usersTable).values({
    sessionId: newSessionId,
    email: normalizedEmail,
    passwordHash,
  });

  const token = signToken(newSessionId, normalizedEmail);
  res.json({ token, sessionId: newSessionId, email: normalizedEmail });
});

// POST /auth/login
// Body: { email, password }
router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email и пароль обязательны" });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();

  const [user] = await db
    .select({ sessionId: usersTable.sessionId, email: usersTable.email, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const token = signToken(user.sessionId, normalizedEmail);
  res.json({ token, sessionId: user.sessionId, email: normalizedEmail });
});

// GET /auth/verify — verify a JWT token
router.get("/verify", (req, res) => {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Токен не предоставлен" });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sessionId: string; email: string };
    res.json({ valid: true, sessionId: payload.sessionId, email: payload.email });
  } catch {
    res.status(401).json({ error: "Недействительный или просроченный токен" });
  }
});

export { JWT_SECRET };
export default router;
