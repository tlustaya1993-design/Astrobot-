import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/me", async (req, res) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "x-session-id header required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

router.put("/me", async (req, res) => {
  const sessionId = req.headers["x-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "x-session-id header required" });
    return;
  }

  const {
    name,
    birthDate,
    birthTime,
    birthPlace,
    birthLat,
    birthLng,
    gender,
    language,
    onboardingDone,
    tonePreferredDepth,
    tonePreferredStyle,
    toneEmotionalSensitivity,
    toneFamiliarityLevel,
  } = req.body;

  const now = new Date();

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  const fields = {
    ...(name !== undefined && { name }),
    ...(birthDate !== undefined && { birthDate }),
    ...(birthTime !== undefined && { birthTime }),
    ...(birthPlace !== undefined && { birthPlace }),
    ...(birthLat !== undefined && { birthLat: birthLat !== null ? Number(birthLat) : null }),
    ...(birthLng !== undefined && { birthLng: birthLng !== null ? Number(birthLng) : null }),
    ...(gender !== undefined && { gender }),
    ...(language !== undefined && { language }),
    ...(onboardingDone !== undefined && { onboardingDone }),
    ...(tonePreferredDepth !== undefined && { tonePreferredDepth }),
    ...(tonePreferredStyle !== undefined && { tonePreferredStyle }),
    ...(toneEmotionalSensitivity !== undefined && { toneEmotionalSensitivity }),
    ...(toneFamiliarityLevel !== undefined && { toneFamiliarityLevel }),
  };

  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ ...fields, updatedAt: now })
      .where(eq(usersTable.sessionId, sessionId))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({ sessionId, ...fields })
      .returning();
    res.json(created);
  }
});

export default router;
