import { Router, type IRouter, type Request } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "astrobot-dev-secret-change-in-production";
const SALT_ROUNDS = 10;
const TOKEN_TTL = "365d";
const OAUTH_STATE_TTL = "10m";
const YANDEX_OAUTH_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const YANDEX_OAUTH_TOKEN_URL = "https://oauth.yandex.ru/token";
const YANDEX_USERINFO_URL = "https://login.yandex.ru/info?format=json";

function signToken(sessionId: string, email: string): string {
  return jwt.sign({ sessionId, email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

interface YandexOAuthState {
  type: "yandex_oauth_state";
  sessionId: string | null;
  returnTo: string;
}

function getPublicBaseUrl(req: Request): string {
  const fromEnv = process.env.OAUTH_REDIRECT_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const protoHeader = req.headers["x-forwarded-proto"];
  const hostHeader = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader?.split(",")[0] ?? req.protocol ?? "https");
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return `${proto}://${host}`;
}

function sanitizeReturnTo(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) return "/";
  if (!input.startsWith("/") || input.startsWith("//")) return "/";
  return input;
}

function buildYandexCallbackUrl(req: Request): string {
  return `${getPublicBaseUrl(req)}/api/auth/yandex/callback`;
}

function buildFrontendCallbackUrl(req: Request): URL {
  return new URL("/auth/callback", getPublicBaseUrl(req));
}

async function exchangeYandexCode(code: string, redirectUri: string): Promise<string> {
  const clientId = process.env.YANDEX_CLIENT_ID?.trim();
  const clientSecret = process.env.YANDEX_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Yandex OAuth не настроен: отсутствуют YANDEX_CLIENT_ID / YANDEX_CLIENT_SECRET");
  }

  const tokenRes = await fetch(YANDEX_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Не удалось обменять код Yandex OAuth: ${tokenRes.status} ${text}`);
  }

  const tokenPayload = (await tokenRes.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error("Yandex OAuth не вернул access_token");
  }
  return tokenPayload.access_token;
}

async function fetchYandexProfile(accessToken: string): Promise<{ email: string; name: string | null }> {
  const profileRes = await fetch(YANDEX_USERINFO_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  });

  if (!profileRes.ok) {
    const text = await profileRes.text();
    throw new Error(`Не удалось получить профиль Yandex: ${profileRes.status} ${text}`);
  }

  const profile = (await profileRes.json()) as {
    default_email?: string;
    emails?: string[];
    real_name?: string;
    first_name?: string;
    last_name?: string;
    login?: string;
  };

  const rawEmail = profile.default_email ?? profile.emails?.[0];
  if (!rawEmail) {
    throw new Error("Yandex не вернул email пользователя");
  }

  const fullName = profile.real_name?.trim()
    || `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
    || null;

  return {
    email: rawEmail.trim().toLowerCase(),
    name: fullName || profile.login?.trim() || null,
  };
}

async function resolveOAuthUserSession(email: string, name: string | null, candidateSessionId: string | null): Promise<string> {
  const [existingByEmail] = await db
    .select({
      sessionId: usersTable.sessionId,
      name: usersTable.name,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existingByEmail) {
    if (!existingByEmail.name && name) {
      await db
        .update(usersTable)
        .set({ name, updatedAt: new Date() })
        .where(eq(usersTable.sessionId, existingByEmail.sessionId));
    }
    return existingByEmail.sessionId;
  }

  if (candidateSessionId) {
    const [candidate] = await db
      .select({
        sessionId: usersTable.sessionId,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.sessionId, candidateSessionId))
      .limit(1);

    if (candidate && (!candidate.email || candidate.email === email)) {
      await db
        .update(usersTable)
        .set({
          email,
          ...(name ? { name } : {}),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.sessionId, candidateSessionId));
      return candidateSessionId;
    }
  }

  const freshSessionId = randomUUID();
  await db.insert(usersTable).values({
    sessionId: freshSessionId,
    email,
    ...(name ? { name } : {}),
  });
  return freshSessionId;
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

// GET /auth/yandex/start
router.get("/yandex/start", async (req, res) => {
  const clientId = process.env.YANDEX_CLIENT_ID?.trim();
  if (!clientId) {
    res.status(503).json({ error: "Yandex OAuth не настроен (нет YANDEX_CLIENT_ID)" });
    return;
  }

  const sessionIdFromQuery = typeof req.query.sessionId === "string" ? req.query.sessionId : null;
  const sessionId = sessionIdFromQuery || req.sessionId || null;
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const statePayload: YandexOAuthState = {
    type: "yandex_oauth_state",
    sessionId,
    returnTo,
  };
  const state = jwt.sign(statePayload, JWT_SECRET, { expiresIn: OAUTH_STATE_TTL });
  const redirectUri = buildYandexCallbackUrl(req);
  const authorizeUrl = new URL(YANDEX_OAUTH_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  res.redirect(authorizeUrl.toString());
});

// GET /auth/yandex/callback
router.get("/yandex/callback", async (req, res) => {
  const frontendCallback = buildFrontendCallbackUrl(req);
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  frontendCallback.searchParams.set("returnTo", returnTo);

  const appendErrorAndRedirect = (message: string) => {
    frontendCallback.searchParams.set("error", message);
    res.redirect(frontendCallback.toString());
  };

  if (typeof req.query.error === "string") {
    const reason = typeof req.query.error_description === "string"
      ? req.query.error_description
      : req.query.error;
    appendErrorAndRedirect(`Авторизация отменена: ${reason}`);
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;

  if (!code || !state) {
    appendErrorAndRedirect("Отсутствует code/state в ответе Yandex OAuth");
    return;
  }

  try {
    const decoded = jwt.verify(state, JWT_SECRET) as YandexOAuthState;
    if (decoded.type !== "yandex_oauth_state") {
      appendErrorAndRedirect("Неверный state при авторизации");
      return;
    }

    frontendCallback.searchParams.set("returnTo", sanitizeReturnTo(decoded.returnTo));
    const redirectUri = buildYandexCallbackUrl(req);
    const accessToken = await exchangeYandexCode(code, redirectUri);
    const profile = await fetchYandexProfile(accessToken);
    const sessionId = await resolveOAuthUserSession(profile.email, profile.name, decoded.sessionId);
    const token = signToken(sessionId, profile.email);

    frontendCallback.searchParams.set("token", token);
    frontendCallback.searchParams.set("sessionId", sessionId);
    frontendCallback.searchParams.set("email", profile.email);
    res.redirect(frontendCallback.toString());
  } catch (error) {
    logger.error({ err: error }, "Yandex OAuth callback failed");
    const message = error instanceof Error ? error.message : "Ошибка входа через Яндекс";
    appendErrorAndRedirect(message);
  }
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

// POST /auth/logout
// Client-side auth is token-based, so logout primarily happens on the client.
// This endpoint exists for explicit logout flow and observability.
router.post("/logout", (req, res) => {
  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sessionId?: string; email?: string };
      logger.info(
        {
          sessionId: payload.sessionId ?? null,
          email: payload.email ?? null,
        },
        "User logged out",
      );
    } catch {
      // Token may already be invalid/expired; logout should still be idempotently successful.
    }
  }

  res.json({ ok: true });
});

export { JWT_SECRET };
export default router;
