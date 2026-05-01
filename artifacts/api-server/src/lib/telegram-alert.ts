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
  userSaw?: string;
};

type ParsedAlert = {
  blocker: "да" | "нет";
  what: string;
  action: string;
};

function isConfigured(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

async function explainWithHaiku(errorType: string, rawError: string, context: AlertContext): Promise<ParsedAlert> {
  const fallback: ParsedAlert = { blocker: "да", what: rawError.slice(0, 120), action: "Посмотрите логи на Railway." };

  const contextLines = [
    context.endpoint && `Эндпоинт: ${context.endpoint}`,
    context.sessionId && `Session: ${context.sessionId.slice(0, 8)}...`,
    context.email && `Email: ${context.email}`,
    context.conversationId && `ConversationId: ${context.conversationId}`,
    context.extra && `Детали: ${context.extra}`,
  ].filter(Boolean).join("\n");

  const prompt = `Ты — помощник, который объясняет технические ошибки владелице чат-бота AstroBot. Она не программист.

Тип ошибки: ${errorType}
Текст ошибки: ${rawError}
${contextLines ? `Контекст:\n${contextLines}` : ""}

Ответь строго в таком формате (3 строки, без лишнего):
Блокер: да
Что случилось: <одно предложение простыми словами — что сломалось у пользователя>
Что делать: <одно предложение — конкретное действие без технического жаргона; если ничего делать не надо — так и напиши>

Правила для "Блокер": "да" если пользователь прямо сейчас не может отправить сообщение или завершить оплату; "нет" если это фоновая ошибка.
Правила для "Что делать": не пиши "проверьте API" или "обратитесь в поддержку" — пиши конкретно: "подождите 5 минут", "скорее всего само прошло", "откройте Railway и посмотрите логи за последние 10 минут" и т.п.`;

  try {
    const client = getAnthropic();
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = resp.content[0]?.type === "text" ? resp.content[0].text.trim() : "";
    if (!text) return fallback;

    const blockerMatch = text.match(/Блокер:\s*(да|нет)/i);
    const whatMatch = text.match(/Что случилось:\s*(.+)/i);
    const actionMatch = text.match(/Что делать:\s*(.+)/i);

    return {
      blocker: (blockerMatch?.[1]?.toLowerCase() === "да" ? "да" : "нет"),
      what: whatMatch?.[1]?.trim() || fallback.what,
      action: actionMatch?.[1]?.trim() || fallback.action,
    };
  } catch {
    return fallback;
  }
}

async function sendToTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: "HTML" }),
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
    const { blocker, what, action } = await explainWithHaiku(errorType, rawError, context);
    const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
    const blockerLine = blocker === "да" ? "🔴 <b>Блокер: да</b>" : "🟡 <b>Блокер: нет</b>";

    const contextParts = [
      context.endpoint && `🔗 ${context.endpoint}`,
      context.email && `👤 ${context.email}`,
      context.sessionId && `🪪 ${context.sessionId.slice(0, 12)}...`,
      context.conversationId && `💬 conv#${context.conversationId}`,
    ].filter(Boolean);

    const lines = [
      blockerLine,
      `🚨 <b>Ошибка AstroBot</b> [${now} МСК]`,
      `<b>Тип:</b> ${errorType}`,
      contextParts.length ? contextParts.join("  ") : null,
      "",
      what,
      `→ ${action}`,
      context.userSaw ? `\n💬 <b>Пользователь видел:</b> «${context.userSaw}»` : null,
      "",
      `<i>Лог (для разработчика):</i> <code>${rawError.slice(0, 200)}</code>`,
    ].filter((l) => l !== null);

    await sendToTelegram(lines.join("\n").replace(/\n{3,}/g, "\n\n"));
  } catch {
    // Never crash the main request due to alert failure
  }
}
