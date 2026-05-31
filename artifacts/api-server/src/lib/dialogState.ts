const MAX_SIGNALS = 30;

const ASTRO_HOOK_TERMS =
  /(?:сатурн|юпитер|марс|луна|солнце|меркурий|венера|плутон|уран|нептун|хирон|лилит|узел|узлы|дома|дом|соляр|прогресси|дирекци|транзит|натал|синастри|асцендент|mc|ic)/i;

/** Приглашение продолжить разбор без обязательного «?». */
const HOOK_INVITATION_RE =
  /(?:хочешь\s+посмотреть|хочешь\s+посмотрим|могу\s+посмотреть|если\s+интересно|можно\s+отдельно\s+разобрать|дальше\s+можно\s+посмотреть)/i;

function isHookSentence(sentence: string): boolean {
  if (!ASTRO_HOOK_TERMS.test(sentence)) return false;
  if (sentence.includes("?")) return true;
  return HOOK_INVITATION_RE.test(sentence);
}

const SIGNAL_LINE_RE = /✦\s*(.+?)\s*→/;

/** Нормализация для дедупа: сокращения, орбы, служебные слова, символы аспектов. */
function signalKey(signal: string): string {
  return signal
    .toLowerCase()
    .replace(/транзитный|транзитная|транзитное|транз\./g, "")
    .replace(/натальный|натальная|натальное|натал\./g, "")
    .replace(/прогрессированный|прогрессированная|прогрессированное|прогр\./g, "")
    .replace(/солярная дуга|дуга/g, "")
    .replace(/соляр/g, "")
    .replace(/[△▲]/g, "трин")
    .replace(/⚹/g, "секстиль")
    .replace(/□/g, "квадрат")
    .replace(/☍/g, "оппозиция")
    .replace(/☌/g, "соединение")
    .replace(/точный|точная|нарастает|спадает/g, "")
    .replace(/\(орб\s*[\d.,°\s]+\)/g, "")
    .replace(/[\d.,°'''""]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAstroBlockLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("✦") || /^\*{1,2}\s*✦/.test(t);
}

/**
 * Извлекает сигналы из ✦-блока ответа (хвост сообщения с первой строки ✦).
 */
export function extractSignalsFromResponse(text: string): string[] {
  if (!text.trim()) return [];

  const lines = text.split(/\n/);
  let astroStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isAstroBlockLine(lines[i])) {
      astroStart = i;
      break;
    }
  }
  if (astroStart === -1) return [];

  const signals: string[] = [];
  for (let i = astroStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.includes("✦")) continue;
    const match = line.match(SIGNAL_LINE_RE);
    if (match?.[1]) {
      signals.push(match[1].trim());
    }
  }
  return signals;
}

/**
 * Тема последнего крючка: последнее предложение с «?» или приглашением («могу посмотреть» и т.п.) и астротермином.
 */
export function extractLastHookTopic(text: string): string | null {
  if (!text.trim()) return null;

  const sentences = text.match(/[^.!??\n]+(?:[.!?]+|$)/g) ?? [];
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i].replace(/\s+/g, " ").trim();
    if (!isHookSentence(sentence)) continue;
    return sentence;
  }
  return null;
}

/** Объединяет сигналы, дедуплицирует по нормализованному ключу, лимит 30 (старые отбрасываются). */
export function dedupeSignals(existing: string[], newSignals: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const raw of [...existing, ...newSignals]) {
    if (typeof raw !== "string") continue;
    const signal = raw.trim();
    if (!signal) continue;
    const key = signalKey(signal);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(signal);
  }

  if (merged.length <= MAX_SIGNALS) return merged;
  return merged.slice(-MAX_SIGNALS);
}

/** Безопасный парсинг JSON-массива сигналов из БД. */
export function parseUsedSignalsJson(json: string | null | undefined): string[] {
  if (!json?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}
