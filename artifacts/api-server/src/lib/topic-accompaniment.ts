export type TopicAccompanimentMode = "fresh" | "ongoing" | "recheck";

export interface TopicAccompanimentDialogState {
  /** Astro signals already articulated in this conversation (proxy for central thesis). */
  usedSignals: string[];
  /** Completed assistant replies before the current user turn. */
  assistantReplyCount: number;
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

const MAX_RECENT_QUESTION_CHARS = 160;

function truncateQuestion(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_RECENT_QUESTION_CHARS) return normalized;
  return `${normalized.slice(0, MAX_RECENT_QUESTION_CHARS - 1).trimEnd()}…`;
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

/** A life-theme bucket appears in at least two user turns. */
function hasThematicContinuity(bucketSets: string[][]): boolean {
  const counts = new Map<string, number>();
  for (const set of bucketSets) {
    for (const id of set) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.values()].some((c) => c >= 2);
}

/** Adjacent user turns share at least one thematic bucket. */
function hasAdjacentThematicLink(bucketSets: string[][]): boolean {
  for (let i = 1; i < bucketSets.length; i++) {
    if (sharedBucketIds([bucketSets[i - 1]!, bucketSets[i]!]).length > 0) {
      return true;
    }
  }
  return false;
}

function detectSameTopicThread(bucketSets: string[][]): boolean {
  if (bucketSets.length < 2) return false;
  return hasThematicContinuity(bucketSets) || hasAdjacentThematicLink(bucketSets);
}

/**
 * Current user turn did not introduce a thematic bucket absent from prior turns.
 * Proxy for «no new strong signals» in the user's framing.
 */
function detectNoNewStrongSignals(bucketSets: string[][]): boolean {
  if (bucketSets.length < 2) return false;
  const prior = unionBucketIds(bucketSets.slice(0, -1));
  const current = bucketSets.at(-1) ?? [];
  if (current.length === 0) return true;
  return current.every((id) => prior.includes(id));
}

function detectCentralThesisExists(dialogState: TopicAccompanimentDialogState): boolean {
  return dialogState.assistantReplyCount >= 1;
}

/**
 * Multi-turn topic accompaniment from user messages + lightweight dialog state.
 * Recheck is dialog-state driven, not tied to doubt wording in user messages.
 */
export function analyzeTopicAccompaniment(
  userMessages: string[],
  dialogState: TopicAccompanimentDialogState = { usedSignals: [], assistantReplyCount: 0 },
): TopicAccompanimentAnalysis {
  const userTurn = userMessages.length;
  const recentUserQuestions = userMessages.slice(-4).map(truncateQuestion);
  const bucketSets = userMessages.map(detectTopicBuckets);

  const isSameTopicThread = detectSameTopicThread(bucketSets);
  const centralThesisExists = detectCentralThesisExists(dialogState);
  const noNewStrongSignals = detectNoNewStrongSignals(bucketSets);

  const labelSource = isSameTopicThread
    ? sharedBucketIds(bucketSets).length > 0
      ? sharedBucketIds(bucketSets)
      : unionBucketIds(bucketSets)
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

/** Prompt block for multi-turn topic research. Returns null when not active. */
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
  ];

  if (analysis.recentUserQuestions.length > 0) {
    lines.push("", "Последние вопросы пользователя в этой ветке:");
    for (const q of analysis.recentUserQuestions) {
      lines.push(`— ${q}`);
    }
  }

  lines.push(
    "",
    "Центральный вывод",
    "После первого содержательного ответа по этой теме сформируй для себя рабочий центральный вывод (например: «перестройка модели дохода, а не финансовый крах»).",
    "Это не истина и не догма — текущая рабочая картина из карты и диалога.",
    "Не цитируй её как мантру; озвучивай только если помогает углубить ответ.",
    "",
    "Порядок работы (обязателен)",
    "1. СНАЧАЛА заново посмотри в карту (профиль выше) под текущий вопрос.",
    "2. ТОЛЬКО ПОТОМ сверь с прошлым выводом в этом диалоге (включая твой последний ответ в истории).",
    "3. Никогда наоборот: не защищай старый вывод и не подгоняй карту под него.",
    "4. Если новый анализ меняет картину — обнови вывод открыто.",
    "5. Если не меняет — скажи честно; не переупаковывай теми же словами.",
    "",
    "Углубление (без лестницы методов)",
    "Перед ответом спроси себя: есть ли астрологический слой (другой дом, управитель, прогрессии, соляр, другой горизонт), который реально добавит новую информацию по ЭТОЙ теме?",
    "— Если да — используй его.",
    "— Если нет — не выдумывай и не переключайся на прогрессии/соляр только потому что это уже N-й вопрос.",
    "Астрология нелинейна: запрещена схема «1-й вопрос → транзиты, 2-й → натал, 3-й → прогрессии, 4-й → соляр».",
    "",
    "Повторы",
    "Важные факторы можно напомнить коротко («как уже смотрели» — одна фраза).",
    "Запрещено десять раз переупаковывать один и тот же вывод разными словами.",
    "Цель: картина становится глубже, а не «10 раз про один и тот же Юпитер».",
  );

  if (analysis.mode === "recheck") {
    lines.push(
      "",
      "РЕЖИМ ПЕРЕПРОВЕРКИ",
      "Диалог продолжает ту же тему; центральный вывод уже сформирован; новый вопрос не принёс нового сильного сигнала.",
      "Посмотри карту другим углом (другой дом, управитель, слой, горизонт).",
      "Если картина не меняется — профессионально скажи, например:",
      "«Я ещё раз посмотрел карту другим способом. Основной вывод не изменился. Новых факторов, которые существенно меняют картину, сейчас не вижу.»",
      "Это хороший ответ. Не выдумывай новые трактовки ради новизны.",
    );
  }

  return `${lines.join("\n")}\n`;
}
