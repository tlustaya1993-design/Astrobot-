import { Router, type IRouter } from "express";
import { db, conversations, contactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { generateFollowUpChips } from "../../lib/follow-up-chips-llm.js";

const router: IRouter = Router();
const AUTH_REQUIRED_ERROR = "Требуется авторизация";
const MAX_TEXT_CHARS = 12000;

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
  contactId?: unknown;
  contactExtendedMode?: unknown;
  messageId?: unknown;
};

function emptyChipsResponse(
  res: { json: (payload: unknown) => void },
  messageId: number | null,
): void {
  res.json({ messageId, chips: [] });
}

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
  const userText = typeof body.userText === "string" ? body.userText : "";
  const assistantText =
    typeof body.assistantText === "string" ? body.assistantText : "";

  if (!assistantText.trim()) {
    emptyChipsResponse(res, null);
    return;
  }

  if (
    userText.length > MAX_TEXT_CHARS ||
    assistantText.length > MAX_TEXT_CHARS
  ) {
    emptyChipsResponse(res, null);
    return;
  }

  const messageId =
    typeof body.messageId === "number" && Number.isFinite(body.messageId)
      ? body.messageId
      : null;

  let contactExtendedMode = false;
  if (body.contactExtendedMode !== undefined) {
    contactExtendedMode = body.contactExtendedMode === true;
  }

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

    if (body.contactExtendedMode === undefined) {
      contactExtendedMode = Boolean(conv.contactExtendedMode);
    }

    let contact: { name: string; relation?: string | null } | null = null;
    const requestedContactId =
      typeof body.contactId === "number" && Number.isFinite(body.contactId)
        ? body.contactId
        : conv.contactId;

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

    const chips = await generateFollowUpChips({
      userText,
      assistantText,
      contact,
      contactExtendedMode,
    });

    res.json({ messageId, chips });
  } catch (err) {
    logger.warn(
      { err, conversationId, sessionId },
      "follow-up-chips route failed",
    );
    emptyChipsResponse(res, messageId);
  }
});

export default router;
