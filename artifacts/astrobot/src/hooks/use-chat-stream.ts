import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSessionId, getAuthHeaders } from '@/lib/session';
import { createOpenaiConversation, getListOpenaiConversationsQueryKey, getGetOpenaiConversationQueryKey, OpenaiMessage } from '@workspace/api-client-react';

export function useChatStream(conversationId?: number) {
  const [localMessages, setLocalMessages] = useState<OpenaiMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [paywallState, setPaywallState] = useState<{
    open: boolean;
    message: string;
    freeRemaining?: number;
    required?: number;
    balance?: number;
  } | null>(null);
  const queryClient = useQueryClient();

  const sendMessage = async (content: string, contactId?: number | null) => {
    const sessionId = getSessionId();
    let targetId = conversationId;

    const tempUserMsg: OpenaiMessage = {
      id: Date.now(),
      conversationId: targetId || 0,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    setLocalMessages(prev => [...prev, tempUserMsg]);
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

      const body: Record<string, unknown> = { content, sessionId };
      if (contactId != null) body.contactId = contactId;

      const res = await fetch(`/api/openai/conversations/${targetId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        let message = 'Failed to send message';
        let payloadMeta: { freeRemaining?: number; required?: number; balance?: number } = {};
        try {
          const payload = await res.json() as { error?: string; freeRemaining?: number; required?: number; balance?: number };
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
            setPaywallState({
              open: true,
              message: payload?.error || 'Лимит запросов исчерпан. Пополните пакет.',
              ...payloadMeta,
            });
          }
        } catch {
          // keep generic fallback
        }
        throw new Error(message);
      }

      const reader = res.body?.getReader();
      if (!reader) return targetId;
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

      const tempAssistantMsg: OpenaiMessage = {
        id: Date.now() + 1,
        conversationId: targetId,
        role: 'assistant',
        content: assistantMsg,
        createdAt: new Date().toISOString()
      };
      setLocalMessages(prev => [...prev, tempAssistantMsg]);
      queryClient.invalidateQueries({ queryKey: getGetOpenaiConversationQueryKey(targetId) });

    } catch (error) {
      console.error('Chat error:', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Сервис временно недоступен. Попробуйте чуть позже.';
      const tempAssistantError: OpenaiMessage = {
        id: Date.now() + 1,
        conversationId: targetId || 0,
        role: 'assistant',
        content: `Не удалось получить ответ: ${message}`,
        createdAt: new Date().toISOString(),
      };
      setLocalMessages(prev => [...prev, tempAssistantError]);
    } finally {
      setIsStreaming(false);
      setStreamingText('');
    }

    return targetId;
  };

  const clearLocalMessages = () => setLocalMessages([]);
  const closePaywall = () => setPaywallState(null);

  return { localMessages, isStreaming, streamingText, paywallState, closePaywall, sendMessage, clearLocalMessages };
}
