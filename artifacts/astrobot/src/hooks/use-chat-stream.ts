import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSessionId, getAuthHeaders } from '@/lib/session';
import { recordAiSuccess } from '@/lib/pwa-hints';
import { createOpenaiConversation, getListOpenaiConversationsQueryKey, getGetOpenaiConversationQueryKey, OpenaiMessage } from '@workspace/api-client-react';

type PaywallState = {
  open: boolean;
  message: string;
  freeRemaining?: number;
  required?: number;
  balance?: number;
  wantsAuth?: boolean;
};

const GENERIC_TEMP_ERROR = 'Астробот сейчас временно недоступен. Попробуй повторить запрос через минуту 💫';

/** Returns true if the string contains raw API-provider internals that must never reach the user. */
function isProviderLeak(s: string): boolean {
  const l = s.toLowerCase();
  return (
    l.includes('request_id') ||
    l.includes('invalid_request_error') ||
    l.includes('api_error') ||
    l.includes('overloaded_error') ||
    l.includes('credit balance') ||
    l.includes('plans & billing') ||
    l.includes('anthropic') ||
    l.includes('"type":"error"') ||
    l.includes('"type": "error"') ||
    // raw HTTP status + JSON body: "400 {..." or "500 [..."
    /^\d{3}\s*[{\[]/.test(s.trimStart())
  );
}

/** Браузер часто даёт «Load failed» / «Failed to fetch» без деталей — показываем человеку понятный текст. */
function userFacingChatError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const lower = raw.toLowerCase();

  // Must be first: never expose provider/API internals
  if (isProviderLeak(raw)) return GENERIC_TEMP_ERROR;

  if (
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('too many requests') ||
    (lower.includes('per minute') && lower.includes('limit'))
  ) {
    return 'Секунду собираю инфу по крупицам звездной пыли... В этот раз занимает чуть больше времени. Дай мне пару секунд…';
  }
  if (
    raw === 'Load failed' ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return 'Что-то мне не получается достучаться до небес 🤔 Проверь интернет и попробуй ещё раз.';
  }
  if (raw === 'The user aborted a request.' || lower.includes('abort')) {
    return 'Ой… споткнулся, пока шел. Повтори отправку ещё раз - я лишние запросы не спишу ❤️';
  }
  return raw.trim() || 'сервис сейчас отвечает медленнее обычного. Подождите минуту или обновите страницу.';
}

function appendInterruptedResponseNotice(content: string, message: string): string {
  const trimmed = content.trimEnd();
  const notice = `Ответ оборвался и может быть неполным: ${message}`;
  if (!trimmed) return notice;
  return `${trimmed}\n\n${notice}`;
}

export function useChatStream(conversationId?: number) {
  const [localMessages, setLocalMessages] = useState<OpenaiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [paywallState, setPaywallState] = useState<PaywallState | null>(null);
  const [failureCount, setFailureCount] = useState(0);
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

    let hadSendError = false;
    let requestTimeout: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const clearRequestTimeout = () => {
      if (requestTimeout) {
        clearTimeout(requestTimeout);
        requestTimeout = null;
      }
    };
    requestTimeout = setTimeout(() => controller.abort(), 60_000);

    try {
      if (!targetId) {
        const normalizedTitle = content.replace(/\s+/g, ' ').trim();
        const title =
          normalizedTitle.length > 72
            ? `${normalizedTitle.slice(0, 72).trimEnd()}…`
            : normalizedTitle;
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

      let res!: Response;
      let htmlRetryCount = 0;
      const MAX_HTML_RETRIES = 2;

      fetchRetry: while (true) {
        res = await fetch(`/api/openai/conversations/${targetId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearRequestTimeout();

        if (!res.ok) {
          const raw = await res.text();
          const isHtml = raw.trimStart().startsWith('<!');

          if (isHtml && res.status >= 500 && htmlRetryCount < MAX_HTML_RETRIES) {
            htmlRetryCount++;
            const waitMsg = 'Подожди секундочку… Сервер перезагружается, сейчас попробую ещё раз 🔄';
            setLocalMessages(prev =>
              prev.map(m => m.id === streamingAssistantId ? { ...m, content: waitMsg } : m)
            );
            setStreamingText(waitMsg);
            await new Promise(r => setTimeout(r, 4000 * htmlRetryCount));
            setLocalMessages(prev =>
              prev.map(m => m.id === streamingAssistantId ? { ...m, content: '' } : m)
            );
            setStreamingText('');
            requestTimeout = setTimeout(() => controller.abort(), 60_000);
            continue fetchRetry;
          }

          setLocalMessages(prev => prev.filter((m) => m.id !== streamingAssistantId));
          let message = `Ошибка сервера (${res.status})`;
          let payloadMeta: { freeRemaining?: number; required?: number; balance?: number } = {};
          const openPaywall = (msg: string, meta: typeof payloadMeta) => {
            setPaywallState({
              open: true,
              message: msg,
              ...meta,
            });
          };
          try {
            const payload = JSON.parse(raw) as {
              error?: unknown;
              freeRemaining?: number;
              required?: number;
              balance?: number;
            };
            if (payload?.error) {
              const errStr = typeof payload.error === 'string' ? payload.error : '';
              // Only expose the server error string if it doesn't contain raw provider details
              if (errStr && !isProviderLeak(errStr)) {
                message = errStr;
                if (typeof payload.freeRemaining === 'number') {
                  message += `. Бесплатно осталось: ${payload.freeRemaining}`;
                }
              }
            }
            payloadMeta = {
              freeRemaining: payload?.freeRemaining,
              required: payload?.required,
              balance: payload?.balance,
            };
            if (res.status === 402) {
              const paywallMsg = typeof payload?.error === 'string' && payload.error
                ? payload.error
                : 'Лимит запросов исчерпан. Пополните пакет.';
              openPaywall(paywallMsg, payloadMeta);
            }
          } catch {
            if (isHtml) {
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

        break fetchRetry;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setLocalMessages(prev => prev.filter((m) => m.id !== streamingAssistantId));
        return targetId;
      }
      const decoder = new TextDecoder();
      let assistantMsg = '';
      let streamError: string | null = null;
      let sseBuffer = '';

      // Batch SSE chunks into ~30ms windows. Commit to React state only when
      // the number of completed markdown blocks (\n\n boundaries) increases —
      // AstroMarkdown shows no visible change between block boundaries, so
      // intermediate commits would cause renders and layout effects for nothing.
      let pendingContent = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      let lastBlockCount = 0;
      const commitMsg = (text: string) =>
        setLocalMessages((prev) =>
          prev.map((m) => (m.id === streamingAssistantId ? { ...m, content: text } : m)),
        );
      const flushPending = () => {
        flushTimer = null;
        if (!pendingContent) return;
        assistantMsg += pendingContent;
        pendingContent = '';
        const blockCount = assistantMsg.split('\n\n').length - 1;
        if (blockCount > lastBlockCount) {
          lastBlockCount = blockCount;
          commitMsg(assistantMsg);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        sseBuffer += chunk;
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.content) {
                pendingContent += data.content;
                if (!flushTimer) {
                  flushTimer = setTimeout(flushPending, 30);
                }
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

      // Flush buffered content, then do one unconditional final commit so the
      // complete text is always present when isStreaming flips false.
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flushPending();
      commitMsg(assistantMsg);

      if (streamError) {
        throw new Error(streamError);
      }

      setFailureCount(0);
      recordAiSuccess();
      queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(targetId) });

    } catch (error) {
      clearRequestTimeout();
      console.error('Chat error:', error);
      const errorCode = typeof (error as { code?: unknown })?.code === 'number'
        ? (error as { code: number }).code
        : undefined;
      const message = userFacingChatError(error);
      const isRateLimit = errorCode === 429;
      const noPrefix = isRateLimit || errorCode === 413 || errorCode === 500;
      if (errorCode === 402) {
        hadSendError = true;
        return;
      }
      hadSendError = true;
      setFailureCount(prev => prev + 1);
      setLocalMessages((prev) => {
        const hasStreaming = prev.some((m) => m.id === streamingAssistantId);
        if (hasStreaming) {
          const existingStreaming = prev.find((m) => m.id === streamingAssistantId);
          // Do not leave partial streamed text looking like a complete answer.
          if (existingStreaming?.content?.trim()) {
            return prev.map((m) =>
              m.id === streamingAssistantId
                ? { ...m, content: appendInterruptedResponseNotice(existingStreaming.content, message) }
                : m,
            );
          }
          return prev.map((m) =>
            m.id === streamingAssistantId
              ? { ...m, content: noPrefix ? message : `Сейчас не получилось ответить: ${message}` }
              : m,
          );
        }
        const tempAssistantError: OpenaiMessage = {
          id: Date.now() + 1,
          conversationId: targetId || 0,
          role: 'assistant',
          content: noPrefix ? message : `Сейчас не получилось ответить: ${message}`,
          createdAt: new Date().toISOString(),
        };
        return [...prev, tempAssistantError];
      });
    } finally {
      clearRequestTimeout();
      setIsStreaming(false);
    }

    return hadSendError ? undefined : targetId;
  };

  const clearLocalMessages = () => setLocalMessages([]);
  const removeLocalMessages = (ids: number[]) => {
    const idSet = new Set(ids);
    setLocalMessages(prev => prev.filter(m => !idSet.has(m.id)));
  };
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
    paywallState,
    failureCount,
    closePaywall,
    sendMessage,
    clearLocalMessages,
    removeLocalMessages,
    addLocalSystemMessage,
  };
}
