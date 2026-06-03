import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "./logger.js";

/** Haiku — как память; не списывает запросы пользователя. */
const FOLLOW_UP_CHIPS_MODEL =
  process.env.ANTHROPIC_MEMORY_MODEL?.trim() || "claude-haiku-4-5";

const MAX_CHIPS = 4;
const MAX_CHIP_CHARS = 120;
const MIN_CHIP_CHARS = 8;
const MAX_PROMPT_INPUT_CHARS = 6000;

export type FollowUpChipDto = {
  label: string;
  prompt: string;
  isAffirm?: boolean;
};

export type GenerateFollowUpChipsInput = {
  userText: string;
  assistantText: string;
  contact?: { name: string; relation?: string | null } | null;
  contactExtendedMode?: boolean;
};

const AFFIRM_CHIP: FollowUpChipDto = {
  label: "Да, расскажи подробнее",
  prompt: "Да, расскажи подробнее",
  isAffirm: true,
};

const GENERIC_CHIP_PATTERNS: RegExp[] = [
  /^что мне делать\b/i,
  /^что делать дальше/i,
  /^расскажи подробнее/i,
  /^что это значит/i,
  /^когда станет лучше/i,
  /^когда станет яснее\??$/i,
  /^какие есть риски/i,
  /^что важнее всего сейчас/i,
  /^как это проявится на практике/i,
  /^на что обратить внимание\??$/i,
  /^что поможет сейчас\??$/i,
  /^куда двигаться дальше/i,
  /^когда лучше действовать\??$/i,
  /^когда лучшее время для шага/i,
  /^что важно в ближайшие недели\??$/i,
];

function hasAnthropicProvider(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  );
}

/** Хвост ответа с приглашением углубиться — первый chip «Да, расскажи подробнее». */
export function detectInvitationHookTail(assistantText: string): boolean {
  const trimmed = assistantText.trim();
  if (!trimmed) return false;
  const tail = trimmed.slice(Math.max(0, trimmed.length - 600));
  return /(?:если\s+хочешь|если\s+интересно|могу\s+пойти\s+глубже|могу\s+разобрать|могу\s+посмотреть|хочешь\s+посмотреть|интересно\s*[—-]?\s*могу|могу\s+углубить|хочешь\s+углубить|могу\s+продолжить|если\s+актуально)/i.test(
    tail,
  );
}

function isGenericChip(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return GENERIC_CHIP_PATTERNS.some((re) => re.test(t));
}

function normalizeChipText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < MIN_CHIP_CHARS || t.length > MAX_CHIP_CHARS) return null;
  if (isGenericChip(t)) return null;
  return t;
}

/** Снимает markdown-обёртку ```json ... ``` перед parse. */
export function extractJsonArrayPayload(text: string): string {
  let s = text.trim();
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced) s = fenced[1].trim();
  const bracket = s.match(/\[[\s\S]*\]/);
  return bracket ? bracket[0] : s;
}

/** Парсит и валидирует ответ Haiku: JSON-массив строк. */
export function parseFollowUpChipsFromLlm(text: string): string[] {
  const payload = extractJsonArrayPayload(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const chip = normalizeChipText(item);
    if (!chip) continue;
    const key = chip.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
    if (out.length >= MAX_CHIPS) break;
  }
  return out;
}

function buildContactContext(
  contact?: { name: string; relation?: string | null } | null,
  contactExtendedMode?: boolean,
): string {
  if (!contact?.name) return "";
  const rel = contact.relation?.trim();
  const relPart = rel ? ` (${rel})` : "";
  const mode = contactExtendedMode
    ? "Режим: расширенный разбор с контактом."
    : "Режим: контакт выбран в чате.";
  return `Контакт в диалоге: ${contact.name}${relPart}. ${mode}\n`;
}

function buildSystemPrompt(): string {
  return `Ты помогаешь астрологическому чат-боту предложить 0–${MAX_CHIPS} коротких follow-up вопроса пользователю после ответа ассистента.

Правила:
- Только вопросы, которые логично вытекают из ПОСЛЕДНЕГО ответа ассистента и последнего вопроса пользователя.
- Не придумывай тему, которой не было в ответе (например, отношения, если говорили о карьере).
- Не используй шаблонные универсальные фразы («что мне делать», «расскажи подробнее», «что это значит» и т.п.).
- Если уместных вопросов нет — верни пустой массив [].
- Каждый элемент — одна строка: текст кнопки = текст сообщения пользователя (вопрос на «ты», 4–14 слов).
- Максимум ${MAX_CHIPS} строк.
- Ответь ТОЛЬКО JSON-массивом строк, без markdown и пояснений.
Пример: ["Как соляр связан с моей профессией сейчас?"]`;
}

function toChipDtos(strings: string[]): FollowUpChipDto[] {
  return strings.map((s) => ({ label: s, prompt: s }));
}

function ensureAffirmFirst(chips: FollowUpChipDto[], hook: boolean): FollowUpChipDto[] {
  if (!hook) return chips;
  const hasAffirm = chips.some((c) => c.isAffirm);
  if (hasAffirm) {
    const affirm = chips.filter((c) => c.isAffirm);
    const rest = chips.filter((c) => !c.isAffirm);
    return [...affirm, ...rest].slice(0, MAX_CHIPS);
  }
  return [AFFIRM_CHIP, ...chips].slice(0, MAX_CHIPS);
}

function truncateForPrompt(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Генерация follow-up chips через Haiku. Не трогает billing.
 * Любая ошибка → [] (без throw наружу).
 */
export async function generateFollowUpChips(
  input: GenerateFollowUpChipsInput,
): Promise<FollowUpChipDto[]> {
  const assistantText = input.assistantText?.trim() ?? "";
  const userText = input.userText?.trim() ?? "";
  if (!assistantText) return [];

  const hook = detectInvitationHookTail(assistantText);

  if (!hasAnthropicProvider()) {
    return [];
  }

  try {
    const contactBlock = buildContactContext(
      input.contact,
      input.contactExtendedMode,
    );
    const userContent = `${contactBlock}Вопрос пользователя:
${truncateForPrompt(userText, MAX_PROMPT_INPUT_CHARS)}

Ответ ассистента:
${truncateForPrompt(assistantText, MAX_PROMPT_INPUT_CHARS)}`;

    const response = await anthropic.messages.create({
      model: FOLLOW_UP_CHIPS_MODEL,
      max_tokens: 280,
      temperature: 0.3,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    const strings = parseFollowUpChipsFromLlm(rawText);
    const chips = toChipDtos(strings);
    return ensureAffirmFirst(chips, hook);
  } catch (err) {
    logger.warn({ err }, "generateFollowUpChips failed");
    return [];
  }
}
