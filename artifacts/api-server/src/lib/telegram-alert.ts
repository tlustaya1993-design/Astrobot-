import { getAnthropic } from "@workspace/integrations-anthropic-ai";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const HAIKU_MODEL = process.env.ANTHROPIC_MEMORY_MODEL?.trim() || "claude-haiku-4-5";

export type AlertContext = {
  sessionId?: string;
  email?: string;
  conversationId?: number;
  endpoint?: string;
  extra?: string;
};

function isConfigured(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

async function explainWithHaiku(errorType: string, rawError: string, context: AlertContext): Promise<string> {
  const contextLines = [
    context.endpoint && `Эндпоинт: ${context.endpoint}`,
    context.sessionId && `Session: ${context.sessionId.slice(0, 8)}...`,
    context.email && `Email: ${context.email}`,
    context.conversationId && `ConversationId: ${context.conversationId}`,
    context.extra && `Детали: ${context.extra}`,
  ].filter(Boolean).join("\n");

  const prompt = `Ты — ассистент технической поддержки сервиса AstroBot (астрологический чат-бот).
Получена техническая ошибка. Объясни её по-человечески на русском языке для владельца бизнеса (не программиста).

Тип ошибки: ${errorType}
Сырой текст ошибки: ${rawError}
${contextLines ? `Контекст:\n${contextLines}` : ""}

Ответь строго в таком формате (без лишних слов вокруг):
ЧТО СЛУЧИЛОСЬ: <1-2 предложения что произошло>
СЕРЬЁЗНОСТЬ: <Критично / Важно / Незначительно>
ЧТО ДЕЛАТЬ: <конкретный совет 1-2 предложения>`;

  try {
    const client = getAnthropic();
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
    return text || rawError;
  } catch {
    return rawError;
  }
}

async function sendToTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "HTML",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Telegram API error ${res.status}: ${errText}`);
  }
}

export async function sendTelegramAlert(
  errorType: string,
  rawError: string,
  context: AlertContext = {},
): Promise<void> {
  if (!isConfigured()) return;

  try {
    const explanation = await explainWithHaiku(errorType, rawError, context);
    const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

    const contextParts = [
      context.endpoint && `🔗 ${context.endpoint}`,
      context.email && `👤 ${context.email}`,
      context.sessionId && `🪪 ${context.sessionId.slice(0, 12)}...`,
      context.conversationId && `💬 conv#${context.conversationId}`,
    ].filter(Boolean);

    const lines = [
      `🚨 <b>Ошибка AstroBot</b> [${now} МСК]`,
      `<b>Тип:</b> ${errorType}`,
      contextParts.length ? contextParts.join("  ") : "",
      "",
      explanation,
      "",
      `<code>${rawError.slice(0, 300)}</code>`,
    ].filter((l) => l !== undefined);

    await sendToTelegram(lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  } catch {
    // Never crash the main request due to alert failure
  }
}
