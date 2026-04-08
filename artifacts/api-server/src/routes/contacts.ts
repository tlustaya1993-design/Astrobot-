import { Router, type IRouter } from "express";
import { db, contactsTable, conversations } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { normalizeAvatarConfig, parseAvatarJson } from "../lib/avatar-config.js";

const router: IRouter = Router();

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

  // Detach deleted contact from all user's conversations to avoid stale/misbound synastry chats.
  await db
    .update(conversations)
    .set({ contactId: null })
    .where(and(eq(conversations.sessionId, sessionId), eq(conversations.contactId, id)));

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
