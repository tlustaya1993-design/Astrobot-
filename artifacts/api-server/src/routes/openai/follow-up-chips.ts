import { Router, type IRouter } from "express";
import { db, conversations, contactsTable, messages } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  generateFollowUpChips,
  type FollowUpChipDto,
  type GenerateFollowUpChipsInput,
} from "../../lib/follow-up-chips-llm.js";

const router: IRouter = Router();
const AUTH_REQUIRED_ERROR = "Требуется авторизация";
const MAX_TEXT_CHARS = 12000;
const RECENT_MESSAGE_LOOKBACK = 20;
const CHIP_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CHIP_CACHE_ENTRIES = 1000;

type RecentMessage = {
  id: number;
  role: string;
  content: string;
};

type FollowUpSource = {
  messageId: number;
  userText: string;
  assistantText: string;
};

type ChipCacheEntry = {
  chips: FollowUpChipDto[];
  expiresAt: number;
};

const chipCache = new Map<string, ChipCacheEntry>();
const inFlightChipRequests = new Map<string, Promise<FollowUpChipDto[]>>();

function requireSessionId(
  req: { sessionId?: string },
  res: { status: (code: number) => { json: (payload: unknown) => void } },
): string | null {
  if (!req.sessionId) {
    res.status(401).json({ error: AUTH_REQUIRED_ERROR });
    return null;
  }
  return req.sessionId;
}

type FollowUpChipsBody = {
  userText?: unknown;
  assistantText?: unknown;
  messageId?: unknown;
};

function emptyChipsResponse(
  res: { json: (payload: unknown) => void },
  messageId: number | null,
): void {
  res.json({ messageId, chips: [] });
}

export function resolveFollowUpSource(
  recentMessages: RecentMessage[],
  requestedMessageId: number | null,
): FollowUpSource | null {
  const latestAssistantIndex = recentMessages.findIndex(
    (message) => message.role === "assistant" && message.content.trim(),
  );
  if (latestAssistantIndex < 0) return null;

  const latestAssistant = recentMessages[latestAssistantIndex];
  if (requestedMessageId !== null && latestAssistant.id !== requestedMessageId) {
    return null;
  }

  const precedingUser = recentMessages
    .slice(latestAssistantIndex + 1)
    .find((message) => message.role === "user" && message.content.trim());

  return {
    messageId: latestAssistant.id,
    userText: precedingUser?.content.trim() ?? "",
    assistantText: latestAssistant.content.trim(),
  };
}

function cleanupChipCache(now = Date.now()): void {
  for (const [key, entry] of chipCache.entries()) {
    if (entry.expiresAt <= now) chipCache.delete(key);
  }

  while (chipCache.size > MAX_CHIP_CACHE_ENTRIES) {
    const oldestKey = chipCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    chipCache.delete(oldestKey);
  }
}

async function getCachedOrGenerateFollowUpChips(
  cacheKey: string,
  input: GenerateFollowUpChipsInput,
  generate: (input: GenerateFollowUpChipsInput) => Promise<FollowUpChipDto[]> =
    generateFollowUpChips,
): Promise<FollowUpChipDto[]> {
  const now = Date.now();
  cleanupChipCache(now);

  const cached = chipCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.chips;
  }

  const inFlight = inFlightChipRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = generate(input)
    .then((chips) => {
      chipCache.set(cacheKey, {
        chips,
        expiresAt: Date.now() + CHIP_CACHE_TTL_MS,
      });
      return chips;
    })
    .finally(() => {
      inFlightChipRequests.delete(cacheKey);
    });

  inFlightChipRequests.set(cacheKey, request);
  return request;
}

export function resetFollowUpChipCacheForTests(): void {
  chipCache.clear();
  inFlightChipRequests.clear();
}

export const followUpChipsTestInternals = {
  getCachedOrGenerateFollowUpChips,
};

/**
 * POST /api/openai/conversations/:id/follow-up-chips
 * Отдельный вызов после основного ответа; не списывает запросы.
 * Сбой Haiku/JSON → 200 и chips: [] (не 500).
 */
router.post("/conversations/:id/follow-up-chips", async (req, res) => {
  const conversationId = Number(req.params.id);
  const sessionId = requireSessionId(req, res);
  if (!sessionId) return;

  if (!Number.isFinite(conversationId) || conversationId <= 0) {
    emptyChipsResponse(res, null);
    return;
  }

  const body = req.body as FollowUpChipsBody;
  const bodyUserText = typeof body.userText === "string" ? body.userText : "";
  const bodyAssistantText =
    typeof body.assistantText === "string" ? body.assistantText : "";

  if (!bodyAssistantText.trim()) {
    emptyChipsResponse(res, null);
    return;
  }

  if (
    bodyUserText.length > MAX_TEXT_CHARS ||
    bodyAssistantText.length > MAX_TEXT_CHARS
  ) {
    emptyChipsResponse(res, null);
    return;
  }

  const messageId =
    typeof body.messageId === "number" && Number.isFinite(body.messageId)
      ? body.messageId
      : null;

  try {
    const [conv] = await db
      .select({
        id: conversations.id,
        contactId: conversations.contactId,
        contactExtendedMode: conversations.contactExtendedMode,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.sessionId, sessionId),
        ),
      )
      .limit(1);

    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const contactExtendedMode = Boolean(conv.contactExtendedMode);

    const recentMessages = await db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(RECENT_MESSAGE_LOOKBACK);

    const source = resolveFollowUpSource(recentMessages, messageId);
    if (!source) {
      emptyChipsResponse(res, messageId);
      return;
    }

    let contact: { name: string; relation?: string | null } | null = null;
    const requestedContactId = conv.contactId;

    if (requestedContactId) {
      const [row] = await db
        .select({
          name: contactsTable.name,
          relation: contactsTable.relation,
        })
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.id, requestedContactId),
            eq(contactsTable.sessionId, sessionId),
          ),
        )
        .limit(1);
      if (row) contact = row;
    }

    const cacheKey = `${sessionId}:${conversationId}:${source.messageId}`;
    const chips = await getCachedOrGenerateFollowUpChips(cacheKey, {
      userText: source.userText,
      assistantText: source.assistantText,
      contact,
      contactExtendedMode,
    });

    res.json({ messageId: source.messageId, chips });
  } catch (err) {
    logger.warn(
      { err, conversationId, sessionId },
      "follow-up-chips route failed",
    );
    emptyChipsResponse(res, messageId);
  }
});

export default router;
