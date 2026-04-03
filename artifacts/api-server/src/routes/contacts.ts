import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

type ContactAvatarConfig = {
  hairStyle: string;
  hairColor: string;
  robeColor: string;
  eyeColor: string;
};

const DEFAULT_CONTACT_AVATAR: ContactAvatarConfig = {
  hairStyle: "medium",
  hairColor: "#1c1c2e",
  robeColor: "#3730A3",
  eyeColor: "#3B82F6",
};

const ALLOWED_HAIR_STYLES = new Set(["short", "medium", "long", "curly", "ponytail", "bun"]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeAvatarConfig(input: unknown): ContactAvatarConfig | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const hairStyle = typeof v.hairStyle === "string" ? v.hairStyle : DEFAULT_CONTACT_AVATAR.hairStyle;
  const hairColor = typeof v.hairColor === "string" ? v.hairColor : DEFAULT_CONTACT_AVATAR.hairColor;
  const robeColor = typeof v.robeColor === "string" ? v.robeColor : DEFAULT_CONTACT_AVATAR.robeColor;
  const eyeColor = typeof v.eyeColor === "string" ? v.eyeColor : DEFAULT_CONTACT_AVATAR.eyeColor;

  return {
    hairStyle: ALLOWED_HAIR_STYLES.has(hairStyle) ? hairStyle : DEFAULT_CONTACT_AVATAR.hairStyle,
    hairColor: HEX_COLOR_RE.test(hairColor) ? hairColor : DEFAULT_CONTACT_AVATAR.hairColor,
    robeColor: HEX_COLOR_RE.test(robeColor) ? robeColor : DEFAULT_CONTACT_AVATAR.robeColor,
    eyeColor: HEX_COLOR_RE.test(eyeColor) ? eyeColor : DEFAULT_CONTACT_AVATAR.eyeColor,
  };
}

function parseAvatarJson(input: string | null): ContactAvatarConfig | null {
  if (!input) return null;
  try {
    return normalizeAvatarConfig(JSON.parse(input));
  } catch {
    return null;
  }
}

function toApiContact(row: typeof contactsTable.$inferSelect) {
  const { avatarJson, ...rest } = row;
  return {
    ...rest,
    avatarConfig: parseAvatarJson(avatarJson),
  };
}

router.get("/contacts", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }
  const rows = await db.select().from(contactsTable).where(eq(contactsTable.sessionId, sessionId));
  res.json(rows.map(toApiContact));
});

router.post("/contacts", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const { name, relation, birthDate, birthTime, birthPlace, birthLat, birthLng, avatarConfig } = req.body;
  if (!name || !birthDate) { res.status(400).json({ error: "name and birthDate required" }); return; }
  const normalizedAvatar = normalizeAvatarConfig(avatarConfig);

  const [created] = await db.insert(contactsTable).values({
    sessionId, name, relation, birthDate, birthTime, birthPlace,
    birthLat: birthLat ?? null, birthLng: birthLng ?? null,
    avatarJson: normalizedAvatar ? JSON.stringify(normalizedAvatar) : null,
  }).returning();
  res.status(201).json(toApiContact(created));
});

router.put("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Некорректный id контакта" }); return; }

  const { name, relation, birthDate, birthTime, birthPlace, birthLat, birthLng, avatarConfig } = req.body;
  const values: Partial<typeof contactsTable.$inferInsert> = {
    name,
    relation,
    birthDate,
    birthTime,
    birthPlace,
    birthLat,
    birthLng,
  };
  if (avatarConfig !== undefined) {
    const normalizedAvatar = normalizeAvatarConfig(avatarConfig);
    values.avatarJson = normalizedAvatar ? JSON.stringify(normalizedAvatar) : null;
  }

  const [updated] = await db.update(contactsTable)
    .set(values)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.sessionId, sessionId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toApiContact(updated));
});

router.delete("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  await db.delete(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.sessionId, sessionId)));
  res.status(204).end();
});

router.put("/contacts/:id/avatar", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Некорректный id контакта" }); return; }

  const { avatarConfig } = req.body as { avatarConfig?: unknown };
  const normalizedAvatar = normalizeAvatarConfig(avatarConfig);
  if (!normalizedAvatar) {
    res.status(400).json({ error: "Некорректные параметры аватара" });
    return;
  }

  const [updated] = await db.update(contactsTable)
    .set({
      avatarJson: JSON.stringify(normalizedAvatar),
    })
    .where(and(eq(contactsTable.id, id), eq(contactsTable.sessionId, sessionId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toApiContact(updated));
});

export default router;
