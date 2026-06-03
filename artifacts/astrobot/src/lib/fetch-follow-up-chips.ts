import { getAuthHeaders } from '@/lib/session';
import type { FollowUpChip } from '@/lib/follow-up-chips';

export type FollowUpChipApiDto = {
  label: string;
  prompt: string;
  isAffirm?: boolean;
};

export type FollowUpChipsApiResponse = {
  messageId: number | null;
  chips: FollowUpChipApiDto[];
};

/** Стабильный ключ последнего ответа ассистента (id в БД может смениться после refetch). */
export function buildFollowUpAssistantKey(
  conversationId: number,
  assistantText: string,
): string {
  const t = assistantText.trim();
  const head = t.slice(0, 160);
  const tail = t.slice(-160);
  return `${conversationId}:${t.length}:${head}:${tail}`;
}

export function mapApiChipsToFollowUp(chips: FollowUpChipApiDto[]): FollowUpChip[] {
  return chips.map((c, i) => ({
    intentId: c.isAffirm ? 'hook.affirm' : `llm.${i}.${c.prompt.slice(0, 24)}`,
    label: c.label,
    prompt: c.prompt,
    isAffirm: c.isAffirm,
  }));
}

/**
 * POST follow-up-chips после основного ответа.
 * Любая ошибка / пустой ответ → [] (без throw, кроме abort).
 */
export async function fetchFollowUpChipsFromApi(params: {
  conversationId: number;
  userText: string;
  assistantText: string;
  contactId?: number | null;
  contactExtendedMode?: boolean;
  messageId?: number | null;
  signal?: AbortSignal;
}): Promise<FollowUpChip[]> {
  const { signal, conversationId, ...body } = params;
  try {
    const res = await fetch(
      `/api/openai/conversations/${conversationId}/follow-up-chips`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          userText: body.userText,
          assistantText: body.assistantText,
          contactId: body.contactId ?? undefined,
          contactExtendedMode: body.contactExtendedMode,
          messageId: body.messageId ?? undefined,
        }),
        signal,
      },
    );

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as FollowUpChipsApiResponse;
    if (!Array.isArray(data.chips)) return [];
    return mapApiChipsToFollowUp(data.chips);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    return [];
  }
}
