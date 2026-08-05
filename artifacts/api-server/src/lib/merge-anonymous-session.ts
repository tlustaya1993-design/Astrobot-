import {
  db,
  usersTable,
  paymentsTable,
  conversations,
  contactsTable,
  memoriesTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export type MergeableUserRow = {
  sessionId: string;
  email: string | null;
  passwordHash: string | null;
};

/**
 * A source session may be merged into a destination account only when it is not
 * another authenticated identity:
 * - distinct session
 * - no password (not email/password registered)
 * - email missing, or same email as the destination (guest checkout receipt email)
 *
 * Refuses to merge a different OAuth/registered identity even if an attacker
 * supplies that session id during login/OAuth.
 */
export function canMergeAnonymousSessionWithEmail(
  source: MergeableUserRow,
  destination: { sessionId: string; email: string | null | undefined },
): boolean {
  if (!source.sessionId || !destination.sessionId) return false;
  if (source.sessionId === destination.sessionId) return false;
  if (source.passwordHash) return false;
  const sourceEmail = source.email?.trim().toLowerCase() || null;
  const destEmail = destination.email?.trim().toLowerCase() || null;
  if (sourceEmail && sourceEmail !== destEmail) return false;
  return true;
}

/**
 * Moves guest/anonymous progress (credits, payments, chats, contacts, memories,
 * and fill-in profile fields) into an existing account, then deletes the guest row.
 *
 * Safe no-op when the source is missing or not mergeable.
 */
export async function mergeAnonymousSessionInto(
  destinationSessionId: string,
  sourceSessionId: string | null | undefined,
  destinationEmail?: string | null,
): Promise<boolean> {
  if (!sourceSessionId || sourceSessionId === destinationSessionId) return false;

  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        sessionId: usersTable.sessionId,
        email: usersTable.email,
        passwordHash: usersTable.passwordHash,
        requestsBalance: usersTable.requestsBalance,
        requestsUsed: usersTable.requestsUsed,
        name: usersTable.name,
        birthDate: usersTable.birthDate,
        birthTime: usersTable.birthTime,
        birthTimeUnknown: usersTable.birthTimeUnknown,
        birthPlace: usersTable.birthPlace,
        birthLat: usersTable.birthLat,
        birthLng: usersTable.birthLng,
        avatarJson: usersTable.avatarJson,
        gender: usersTable.gender,
        onboardingDone: usersTable.onboardingDone,
        tonePreferredDepth: usersTable.tonePreferredDepth,
        tonePreferredStyle: usersTable.tonePreferredStyle,
        toneEmotionalSensitivity: usersTable.toneEmotionalSensitivity,
        toneFamiliarityLevel: usersTable.toneFamiliarityLevel,
      })
      .from(usersTable)
      .where(eq(usersTable.sessionId, sourceSessionId))
      .limit(1);

    if (!source) return false;

    const [destination] = await tx
      .select({
        sessionId: usersTable.sessionId,
        email: usersTable.email,
        name: usersTable.name,
        birthDate: usersTable.birthDate,
        birthTime: usersTable.birthTime,
        birthPlace: usersTable.birthPlace,
        birthLat: usersTable.birthLat,
        birthLng: usersTable.birthLng,
        avatarJson: usersTable.avatarJson,
        gender: usersTable.gender,
        onboardingDone: usersTable.onboardingDone,
        tonePreferredDepth: usersTable.tonePreferredDepth,
        tonePreferredStyle: usersTable.tonePreferredStyle,
        toneEmotionalSensitivity: usersTable.toneEmotionalSensitivity,
        toneFamiliarityLevel: usersTable.toneFamiliarityLevel,
      })
      .from(usersTable)
      .where(eq(usersTable.sessionId, destinationSessionId))
      .limit(1);

    if (!destination) return false;

    if (
      !canMergeAnonymousSessionWithEmail(source, {
        sessionId: destination.sessionId,
        email: destinationEmail ?? destination.email,
      })
    ) {
      return false;
    }

    const creditDelta = Math.max(0, source.requestsBalance ?? 0);
    const usedDelta = Math.max(0, source.requestsUsed ?? 0);
    const adoptBirthFromSource = !destination.birthDate && !!source.birthDate;

    await tx
      .update(usersTable)
      .set({
        requestsBalance: sql`${usersTable.requestsBalance} + ${creditDelta}`,
        requestsUsed: sql`${usersTable.requestsUsed} + ${usedDelta}`,
        name: destination.name ?? source.name,
        birthDate: destination.birthDate ?? source.birthDate,
        birthTime: destination.birthTime ?? source.birthTime,
        ...(adoptBirthFromSource
          ? { birthTimeUnknown: source.birthTimeUnknown }
          : {}),
        birthPlace: destination.birthPlace ?? source.birthPlace,
        birthLat: destination.birthLat ?? source.birthLat,
        birthLng: destination.birthLng ?? source.birthLng,
        avatarJson: destination.avatarJson ?? source.avatarJson,
        gender: destination.gender ?? source.gender,
        onboardingDone: destination.onboardingDone || source.onboardingDone,
        tonePreferredDepth: destination.tonePreferredDepth ?? source.tonePreferredDepth,
        tonePreferredStyle: destination.tonePreferredStyle ?? source.tonePreferredStyle,
        toneEmotionalSensitivity:
          destination.toneEmotionalSensitivity ?? source.toneEmotionalSensitivity,
        toneFamiliarityLevel: destination.toneFamiliarityLevel ?? source.toneFamiliarityLevel,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.sessionId, destinationSessionId));

    await tx
      .update(paymentsTable)
      .set({ sessionId: destinationSessionId, updatedAt: new Date() })
      .where(eq(paymentsTable.sessionId, sourceSessionId));

    await tx
      .update(conversations)
      .set({ sessionId: destinationSessionId })
      .where(eq(conversations.sessionId, sourceSessionId));

    await tx
      .update(contactsTable)
      .set({ sessionId: destinationSessionId })
      .where(eq(contactsTable.sessionId, sourceSessionId));

    await tx
      .update(memoriesTable)
      .set({ sessionId: destinationSessionId, updatedAt: new Date() })
      .where(eq(memoriesTable.sessionId, sourceSessionId));

    await tx
      .delete(usersTable)
      .where(
        and(
          eq(usersTable.sessionId, sourceSessionId),
          sql`${usersTable.passwordHash} IS NULL`,
        ),
      );

    logger.info(
      {
        sourceSessionId,
        destinationSessionId,
        creditDelta,
        usedDelta,
      },
      "Merged anonymous/guest session into authenticated account",
    );

    return true;
  });
}
