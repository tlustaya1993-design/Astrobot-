import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/contacts", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }
  const rows = await db.select().from(contactsTable).where(eq(contactsTable.sessionId, sessionId));
  res.json(rows);
});

router.post("/contacts", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const { name, relation, birthDate, birthTime, birthPlace, birthLat, birthLng } = req.body;
  if (!name || !birthDate) { res.status(400).json({ error: "name and birthDate required" }); return; }

  const [created] = await db.insert(contactsTable).values({
    sessionId, name, relation, birthDate, birthTime, birthPlace,
    birthLat: birthLat ?? null, birthLng: birthLng ?? null,
  }).returning();
  res.status(201).json(created);
});

router.put("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  const { name, relation, birthDate, birthTime, birthPlace, birthLat, birthLng } = req.body;
  const [updated] = await db.update(contactsTable)
    .set({ name, relation, birthDate, birthTime, birthPlace, birthLat, birthLng })
    .where(and(eq(contactsTable.id, id), eq(contactsTable.sessionId, sessionId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/contacts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const sessionId = req.sessionId;
  if (!sessionId) { res.status(401).json({ error: "Требуется авторизация" }); return; }

  await db.delete(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.sessionId, sessionId)));
  res.status(204).end();
});

export default router;
