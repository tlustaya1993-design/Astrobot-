import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { normalizeAvatarConfig, parseAvatarJson } from "../lib/avatar-config.js";
import { FREE_REQUESTS_LIMIT, isUnlimitedEmail } from "../lib/billing-policy.js";

const router: IRouter = Router();

type UserRow = typeof usersTable.$inferSelect;

type ChartSlice = {
  birthDate?: string | null;
  birthTime?: string | null;
  birthTimeUnknown?: boolean;
  birthPlace?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
};

function normPlace(s: string | null | undefined) {
  return String(s ?? "").trim();
}

function pickChartSlice(row: ChartSlice | null | undefined) {
  return {
    bd: row?.birthDate ?? "",
    bt: row?.birthTime ?? "",
    btu: Boolean(row?.birthTimeUnknown),
    bp: normPlace(row?.birthPlace),
    lat:
      row?.birthLat != null && Number.isFinite(Number(row.birthLat))
        ? Number(row.birthLat)
        : null,
    lng:
      row?.birthLng != null && Number.isFinite(Number(row.birthLng))
        ? Number(row.birthLng)
        : null,
  };
}

function chartSignature(slice: ReturnType<typeof pickChartSlice>) {
  return JSON.stringify(slice);
}

function toApiUser(row: UserRow) {
  const { passwordHash: _, avatarJson, ...rest } = row;
  const requestsUsed = Math.max(0, rest.requestsUsed ?? 0);
  const requestsBalance = Math.max(0, rest.requestsBalance ?? 0);
  const freeRemaining = Math.max(0, FREE_REQUESTS_LIMIT - requestsUsed);
  const isUnlimited = isUnlimitedEmail(rest.email);
  return {
    ...rest,
    avatarConfig: parseAvatarJson(avatarJson),
    freeRemaining,
    freeLimit: FREE_REQUESTS_LIMIT,
    isUnlimited,
    remaining: isUnlimited ? Number.MAX_SAFE_INTEGER : freeRemaining + requestsBalance,
  };
}

router.get("/me", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  if (!user) {
    await db.insert(usersTable).values({ sessionId }).onConflictDoNothing();
    [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.sessionId, sessionId))
      .limit(1);
  }

  if (!user) {
    res.status(500).json({ error: "Не удалось создать профиль" });
    return;
  }

  res.json(toApiUser(user));
});

router.put("/me", async (req, res) => {
  const sessionId = req.sessionId;
  if (!sessionId) {
    res.status(401).json({ error: "Требуется авторизация" });
    return;
  }

  const {
    name,
    birthDate,
    birthTime,
    birthTimeUnknown,
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
    avatarConfig,
  } = req.body;

  const now = new Date();

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.sessionId, sessionId))
    .limit(1);

  // Guard against accidental overwrite when someone opens /onboarding
  // in an already configured account/session.
  const requestedOnboardingComplete = onboardingDone !== undefined && Boolean(onboardingDone);
  const requestedChartOverwrite =
    birthDate !== undefined
    || birthTime !== undefined
    || birthTimeUnknown !== undefined
    || birthPlace !== undefined
    || birthLat !== undefined
    || birthLng !== undefined;
  if (existing?.onboardingDone && requestedOnboardingComplete && requestedChartOverwrite) {
    res.status(409).json({
      error: "Онбординг уже завершён для этого аккаунта. Редактируйте профиль через экран профиля.",
      code: "ONBOARDING_ALREADY_COMPLETED",
    });
    return;
  }

  const fields: Partial<typeof usersTable.$inferInsert> = {
    ...(name !== undefined && { name }),
    ...(birthDate !== undefined && { birthDate }),
    ...(birthTime !== undefined && { birthTime }),
    ...(birthTimeUnknown !== undefined && { birthTimeUnknown: Boolean(birthTimeUnknown) }),
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

  if (avatarConfig !== undefined) {
    const normalizedAvatar = normalizeAvatarConfig(avatarConfig);
    fields.avatarJson = normalizedAvatar ? JSON.stringify(normalizedAvatar) : null;
  }

  const beforeSlice = pickChartSlice(existing ?? null);
  const afterSlice = pickChartSlice({
    birthDate: fields.birthDate !== undefined ? fields.birthDate : existing?.birthDate,
    birthTime: fields.birthTime !== undefined ? fields.birthTime : existing?.birthTime,
    birthTimeUnknown:
      fields.birthTimeUnknown !== undefined
        ? fields.birthTimeUnknown
        : existing?.birthTimeUnknown,
    birthPlace: fields.birthPlace !== undefined ? fields.birthPlace : existing?.birthPlace,
    birthLat: fields.birthLat !== undefined ? fields.birthLat : existing?.birthLat,
    birthLng: fields.birthLng !== undefined ? fields.birthLng : existing?.birthLng,
  });
  const chartMetaChanged = chartSignature(beforeSlice) !== chartSignature(afterSlice);

  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ ...fields, updatedAt: now })
      .where(eq(usersTable.sessionId, sessionId))
      .returning();
    res.json({ ...toApiUser(updated), chartMetaChanged });
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({ sessionId, ...fields })
      .returning();
    res.json({ ...toApiUser(created), chartMetaChanged });
  }
});

export default router;
