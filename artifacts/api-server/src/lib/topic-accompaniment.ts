export type TopicAccompanimentMode = "fresh" | "ongoing" | "recheck";

export interface TopicAccompanimentDialogState {
  /** Astro signals already articulated in this conversation (✦ / usedSignalsJson). */
  usedSignals: string[];
}

export interface TopicAccompanimentAnalysis {
  mode: TopicAccompanimentMode;
  userTurn: number;
  /** Human-readable topic labels for the prompt (e.g. «деньги и ресурсы»). */
  sharedTopicLabels: string[];
  recentUserQuestions: string[];
  isSameTopicThread: boolean;
  centralThesisExists: boolean;
  noNewStrongSignals: boolean;
}

const TOPIC_BUCKETS: { id: string; label: string; patterns: RegExp[] }[] = [
  {
    id: "money",
    label: "деньги и ресурсы",
    patterns: [/денег/i, /деньг/i, /денеж/i, /доход/i, /зарплат/i, /финанс/i, /бедн/i, /долг/i, /кредит/i, /инвест/i, /банкрот/i],
  },
  {
    id: "work",
    label: "работа и карьера",
    patterns: [/работ/i, /карьер/i, /найм/i, /наймёт/i, /наймут/i, /увольн/i, /проект/i, /бизнес/i, /стартап/i, /клиент/i, /заказ/i],
  },
  {
    id: "relationships",
    label: "отношения",
    patterns: [/отношен/i, /партн/i, /муж/i, /жен/i, /брак/i, /развод/i, /любов/i, /свидан/i],
  },
  {
    id: "relocation",
    label: "переезд и смена места",
    patterns: [/переезд/i, /переезж/i, /эмиграц/i, /релокац/i, /стран/i, /город/i],
  },
  {
    id: "health",
    label: "здоровье",
    patterns: [/здоров/i, /болезн/i, /врач/i, /самочувств/i],
  },
  {
    id: "self",
    label: "самореализация и путь",
    patterns: [/смысл/i, /предназнач/i, /реализ/i, /путь/i, /кто я/i, /astrobot/i],
  },
];

const PLANET_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "sun", re: /солнц/i },
  { id: "moon", re: /лун/i },
  { id: "mercury", re: /меркури/i },
  { id: "venus", re: /венер/i },
  { id: "mars", re: /марс/i },
  { id: "jupiter", re: /юпитер/i },
  { id: "saturn", re: /сатурн/i },
  { id: "uranus", re: /уран/i },
  { id: "neptune", re: /нептун/i },
  { id: "pluto", re: /плутон/i },
  { id: "chiron", re: /хирон/i },
  { id: "lilith", re: /лилит/i },
  { id: "nodes", re: /узл/i },
  { id: "asc", re: /асцендент|асц/i },
  { id: "mc", re: /\bмс\b|mc\b|середина\s+неба/i },
];

const HOUSE_PATTERN = /(?:^|[\s,.;(])(\d{1,2})\s*[-]?\s*(?:й\s+)?дом(?:е|а|у|ом|ов)?/gi;

/** Short follow-up without a new life-theme keyword — implicit same thread. */
const IMPLICIT_CONTINUATION_MAX_CHARS = 80;

const MAX_RECENT_QUESTION_CHARS = 160;

function truncateQuestion(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_RECENT_QUESTION_CHARS) return normalized;
  return `${normalized.slice(0, MAX_RECENT_QUESTION_CHARS - 1).trimEnd()}…`;
}

function normalizeUserText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Detect thematic buckets in user text. */
export function detectTopicBuckets(text: string): string[] {
  const found: string[] = [];
  for (const bucket of TOPIC_BUCKETS) {
    if (bucket.patterns.some((re) => re.test(text))) {
      found.push(bucket.id);
    }
  }
  return found;
}

export function detectTopicLabels(text: string): string[] {
  const ids = detectTopicBuckets(text);
  return TOPIC_BUCKETS.filter((b) => ids.includes(b.id)).map((b) => b.label);
}

/** Explicit planets / houses in user text (for no_new_strong_signals). */
export function extractStrongAstroTokens(text: string): string[] {
  const tokens = new Set<string>();
  const normalized = normalizeUserText(text);

  for (const { id, re } of PLANET_PATTERNS) {
    if (re.test(normalized)) tokens.add(`planet:${id}`);
  }

  for (const match of normalized.matchAll(HOUSE_PATTERN)) {
    const n = Number.parseInt(match[1] ?? "", 10);
    if (n >= 1 && n <= 12) tokens.add(`house:${n}`);
  }

  return [...tokens];
}

function sharedBucketIds(bucketSets: string[][]): string[] {
  if (bucketSets.length === 0) return [];
  const [first, ...rest] = bucketSets;
  return first.filter((id) => rest.every((set) => set.includes(id)));
}

function unionBucketIds(bucketSets: string[][]): string[] {
  return [...new Set(bucketSets.flat())];
}

function bucketsToLabels(ids: string[]): string[] {
  return TOPIC_BUCKETS.filter((b) => ids.includes(b.id)).map((b) => b.label);
}

function hasThematicContinuity(bucketSets: string[][]): boolean {
  const counts = new Map<string, number>();
  for (const set of bucketSets) {
    for (const id of set) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.values()].some((c) => c >= 2);
}

function hasAdjacentThematicLink(bucketSets: string[][]): boolean {
  for (let i = 1; i < bucketSets.length; i++) {
    if (sharedBucketIds([bucketSets[i - 1]!, bucketSets[i]!]).length > 0) {
      return true;
    }
  }
  return false;
}

function hasNewAstroTokens(currentText: string, priorMessages: string[]): boolean {
  const priorTokens = new Set<string>();
  for (const msg of priorMessages) {
    for (const token of extractStrongAstroTokens(msg)) {
      priorTokens.add(token);
    }
  }
  for (const token of extractStrongAstroTokens(currentText)) {
    if (!priorTokens.has(token)) return true;
  }
  return false;
}

function hasNewThematicBucket(bucketSets: string[][]): boolean {
  if (bucketSets.length < 2) return false;
  const prior = unionBucketIds(bucketSets.slice(0, -1));
  const current = bucketSets.at(-1) ?? [];
  if (current.length === 0) return false;
  return current.some((id) => !prior.includes(id));
}

/**
 * Short reply with no new bucket while the thread already has a life-theme anchor.
 */
function isImplicitContinuation(
  userMessages: string[],
  bucketSets: string[][],
): boolean {
  if (userMessages.length < 2) return false;

  const currentText = normalizeUserText(userMessages.at(-1) ?? "");
  if (!currentText || currentText.length > IMPLICIT_CONTINUATION_MAX_CHARS) return false;

  const priorBuckets = unionBucketIds(bucketSets.slice(0, -1));
  if (priorBuckets.length === 0) return false;

  const currentBuckets = bucketSets.at(-1) ?? [];
  if (currentBuckets.some((id) => !priorBuckets.includes(id))) return false;

  return true;
}

function detectSameTopicThread(userMessages: string[], bucketSets: string[][]): boolean {
  if (bucketSets.length < 2) return false;
  return (
    hasThematicContinuity(bucketSets) ||
    hasAdjacentThematicLink(bucketSets) ||
    isImplicitContinuation(userMessages, bucketSets)
  );
}

function detectNoNewStrongSignals(userMessages: string[], bucketSets: string[][]): boolean {
  if (bucketSets.length < 2) return false;
  const current = userMessages.at(-1) ?? "";
  const prior = userMessages.slice(0, -1);
  return !hasNewThematicBucket(bucketSets) && !hasNewAstroTokens(current, prior);
}

function detectCentralThesisExists(dialogState: TopicAccompanimentDialogState): boolean {
  return dialogState.usedSignals.length > 0;
}

/**
 * Multi-turn topic accompaniment from user messages + usedSignals (no LLM, no DB writes).
 * Recheck: same topic + thesis in usedSignals + no new bucket/astro markers in current turn.
 */
export function analyzeTopicAccompaniment(
  userMessages: string[],
  dialogState: TopicAccompanimentDialogState = { usedSignals: [] },
): TopicAccompanimentAnalysis {
  const userTurn = userMessages.length;
  const recentUserQuestions = userMessages.slice(-4).map(truncateQuestion);
  const bucketSets = userMessages.map(detectTopicBuckets);

  const isSameTopicThread = detectSameTopicThread(userMessages, bucketSets);
  const centralThesisExists = detectCentralThesisExists(dialogState);
  const noNewStrongSignals = detectNoNewStrongSignals(userMessages, bucketSets);

  const labelSource = isSameTopicThread
    ? sharedBucketIds(bucketSets).length > 0
      ? sharedBucketIds(bucketSets)
      : unionBucketIds(bucketSets.slice(0, -1))
    : [];
  const sharedTopicLabels = bucketsToLabels(labelSource);

  let mode: TopicAccompanimentMode = "fresh";
  if (isSameTopicThread) {
    if (centralThesisExists && noNewStrongSignals) {
      mode = "recheck";
    } else {
      mode = "ongoing";
    }
  }

  return {
    mode,
    userTurn,
    sharedTopicLabels,
    recentUserQuestions,
    isSameTopicThread,
    centralThesisExists,
    noNewStrongSignals,
  };
}

/** Prompt block — only topic-specific deltas; общие правила в РЕЖИМ ПОДДЕРЖАНИЯ БЕСЕДЫ выше. */
export function buildTopicAccompanimentPromptBlock(
  analysis: TopicAccompanimentAnalysis,
): string | null {
  if (analysis.mode === "fresh" || !analysis.isSameTopicThread) return null;

  const topicLine =
    analysis.sharedTopicLabels.length > 0
      ? analysis.sharedTopicLabels.join(", ")
      : "текущий жизненный вопрос пользователя";

  const lines: string[] = [
    "РЕЖИМ СОПРОВОЖДЕНИЯ ОДНОЙ ТЕМЫ (активен)",
    "",
    `Пользователь ${analysis.userTurn} сообщений подряд исследует одну тему: ${topicLine}.`,
    "Это продолжение исследования, а не новый запрос с нуля.",
    "Общие правила порядка (сначала карта, потом сверка), списка уже разобранного и углубления — в блоке «РЕЖИМ ПОДДЕРЖАНИЯ БЕСЕДЫ» выше.",
  ];

  if (analysis.recentUserQuestions.length > 0) {
    lines.push("", "Последние вопросы пользователя в этой ветке:");
    for (const q of analysis.recentUserQuestions) {
      lines.push(`— ${q}`);
    }
  }

  if (analysis.mode === "ongoing") {
    lines.push(
      "",
      "Сейчас активен режим углубления: в текущем вопросе появился новый жизненный или астрологический акцент.",
      "Ищи новый слой в карте только если он реально меняет или уточняет картину по этой теме.",
    );
  }

  if (analysis.mode === "recheck") {
    lines.push(
      "",
      "РЕЖИМ ПЕРЕПРОВЕРКИ",
      "Тема та же; в usedSignals уже есть опора из ✦; текущий вопрос не добавил нового жизненного bucket и не ввёл новых планет/домов.",
      "Посмотри карту другим углом (другой дом, управитель, слой, горизонт).",
      "Если картина не меняется — профессионально скажи, например:",
      "«Я ещё раз посмотрел карту другим способом. Основной вывод не изменился. Новых факторов, которые существенно меняют картину, сейчас не вижу.»",
      "Это хороший ответ. Не выдумывай новые трактовки ради новизны.",
    );
  }

  return `${lines.join("\n")}\n`;
}
