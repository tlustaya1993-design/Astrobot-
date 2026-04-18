import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSessionId, getAuthHeaders } from '@/lib/session';
import { createOpenaiConversation, getListOpenaiConversationsQueryKey, getGetOpenaiConversationQueryKey, OpenaiMessage } from '@workspace/api-client-react';

type PaywallState = {
  open: boolean;
  message: string;
  freeRemaining?: number;
  required?: number;
  balance?: number;
  wantsAuth?: boolean;
};

export function useChatStream(conversationId?: number) {
  const [localMessages, setLocalMessages] = useState<OpenaiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [paywallState, setPaywallState] = useState<PaywallState | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = async (
    content: string,
    contactId?: number | null,
    contactExtendedMode?: boolean,
  ) => {
    const sessionId = getSessionId();
    let targetId = conversationId;
    const streamingAssistantId = -Date.now();

    const tempUserMsg: OpenaiMessage = {
      id: Date.now(),
      conversationId: targetId || 0,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    const tempAssistantMsg: OpenaiMessage = {
      id: streamingAssistantId,
      conversationId: targetId || 0,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString()
    };
    setLocalMessages(prev => [...prev, tempUserMsg, tempAssistantMsg]);
    setIsStreaming(true);
    setStreamingText('');

    try {
      if (!targetId) {
        const title = content.substring(0, 40) + (content.length > 40 ? '...' : '');
        const conv = await createOpenaiConversation(
          { title },
          { headers: getAuthHeaders() }
        );
        targetId = conv.id;
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      }

      // contactExtendedMode всегда передаём boolean — иначе сервер не узнает о чекбоксе, если contactId не пришёл в этом запросе.
      const body: Record<string, unknown> = {
        content,
        sessionId,
        contactExtendedMode: Boolean(contactExtendedMode),
      };
      if (contactId != null) {
        body.contactId = contactId;
      }

      const res = await fetch(`/api/openai/conversations/${targetId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        setLocalMessages(prev => prev.filter((m) => m.id !== streamingAssistantId));
        let message = `Ошибка сервера (${res.status})`;
        let payloadMeta: { freeRemaining?: number; required?: number; balance?: number } = {};
        const raw = await res.clone().text();
        const openPaywall = (msg: string, meta: typeof payloadMeta) => {
          setPaywallState({
            open: true,
            message: msg,
            ...meta,
          });
        };
        try {
          const payload = JSON.parse(raw) as {
            error?: string;
            freeRemaining?: number;
            required?: number;
            balance?: number;
          };
          if (payload?.error) {
            message = payload.error;
            if (typeof payload.freeRemaining === 'number') {
              message += `. Бесплатно осталось: ${payload.freeRemaining}`;
            }
          }
          payloadMeta = {
            freeRemaining: payload?.freeRemaining,
            required: payload?.required,
            balance: payload?.balance,
          };
          if (res.status === 402) {
            openPaywall(payload?.error || 'Лимит запросов исчерпан. Пополните пакет.', payloadMeta);
          }
        } catch {
          if (raw.trimStart().startsWith('<!')) {
            message =
              res.status >= 500
                ? 'Сервер временно недоступен (внутренняя ошибка). Попробуйте позже или обновите страницу.'
                : `Запрос отклонён (${res.status}). Обновите страницу и войдите снова.`;
          }
          if (res.status === 402) {
            openPaywall(
              'Лимит бесплатных запросов исчерпан. Пополните пакет, чтобы продолжить.',
              payloadMeta,
            );
          }
        }
        throw Object.assign(new Error(message), { code: res.status, payloadMeta });
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setLocalMessages(prev => prev.filter((m) => m.id !== streamingAssistantId));
        return targetId;
      }
      const decoder = new TextDecoder();
      let assistantMsg = '';
      let streamError: string | null = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.content) {
                assistantMsg += data.content;
                setStreamingText(assistantMsg);
                setLocalMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingAssistantId ? { ...m, content: assistantMsg } : m,
                  ),
                );
              }
              if (data.error) {
                streamError = typeof data.error === 'string' ? data.error : 'Generation failed';
                break;
              }
              if (data.done) break;
            } catch {
              // ignore malformed SSE chunks
            }
          }
        }

        if (streamError) break;
      }

      if (streamError) {
        throw new Error(streamError);
      }

      queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(targetId) });

    } catch (error) {
      console.error('Chat error:', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Сервис временно недоступен. Попробуйте чуть позже.';
      const errorCode = typeof (error as { code?: unknown })?.code === 'number'
        ? (error as { code: number }).code
        : undefined;
      if (errorCode === 402) {
        return targetId;
      }
      setLocalMessages((prev) => {
        const hasStreaming = prev.some((m) => m.id === streamingAssistantId);
        if (hasStreaming) {
          return prev.map((m) =>
            m.id === streamingAssistantId
              ? { ...m, content: `Не удалось получить ответ: ${message}` }
              : m,
          );
        }
        const tempAssistantError: OpenaiMessage = {
          id: Date.now() + 1,
          conversationId: targetId || 0,
          role: 'assistant',
          content: `Не удалось получить ответ: ${message}`,
          createdAt: new Date().toISOString(),
        };
        return [...prev, tempAssistantError];
      });
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }

    return targetId;
  };

  const clearLocalMessages = () => setLocalMessages([]);
  const closePaywall = () => setPaywallState(null);

  const addLocalSystemMessage = useCallback(
    (content: string) => {
      setLocalMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          conversationId: conversationId ?? 0,
          role: "system",
          content,
          createdAt: new Date().toISOString(),
        },
      ]);
    },
    [conversationId],
  );

  return {
    localMessages,
    isStreaming,
    streamingText,
    paywallState,
    closePaywall,
    sendMessage,
    clearLocalMessages,
    addLocalSystemMessage,
  };
}
