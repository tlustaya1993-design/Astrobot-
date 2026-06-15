export type TopicAccompanimentMode = "fresh" | "ongoing" | "recheck";

export interface TopicAccompanimentAnalysis {
  mode: TopicAccompanimentMode;
  userTurn: number;
  /** Human-readable topic labels for the prompt (e.g. «деньги и ресурсы»). */
  sharedTopicLabels: string[];
  recentUserQuestions: string[];
  hasDoubtSignals: boolean;
  isSameTopicThread: boolean;
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

const DOUBT_PATTERNS = [
  /а\s+вдруг/i,
  /а\s+если/i,
  /а\s+что\s+если/i,
  /не\s+уверен/i,
  /сомнева/i,
  /боюсь/i,
  /страшно/i,
  /тревож/i,
  /правда\s+ли/i,
  /точно\s+ли/i,
  /не\s+ошиба/i,
  /перепровер/i,
  /ещё\s+раз\s+посмотр/i,
  /снова\s+посмотр/i,
];

const MAX_RECENT_QUESTION_CHARS = 160;

function truncateQuestion(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_RECENT_QUESTION_CHARS) return normalized;
  return `${normalized.slice(0, MAX_RECENT_QUESTION_CHARS - 1).trimEnd()}…`;
}

/** Detect thematic buckets in user text (excluding pure fear markers). */
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

export function hasDoubtSignals(text: string): boolean {
  return DOUBT_PATTERNS.some((re) => re.test(text));
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

/**
 * Heuristic: several user turns around the same life theme (money, work, fears…).
 * No LLM, no DB — only recent user messages in the current conversation.
 */
export function analyzeTopicAccompaniment(userMessages: string[]): TopicAccompanimentAnalysis {
  const userTurn = userMessages.length;
  const recentUserQuestions = userMessages.slice(-4).map(truncateQuestion);
  const doubtFlags = userMessages.map(hasDoubtSignals);
  const hasDoubtInThread = doubtFlags.some(Boolean);
  const bucketSets = userMessages.map(detectTopicBuckets);

  if (userTurn < 2) {
    return {
      mode: "fresh",
      userTurn,
      sharedTopicLabels: [],
      recentUserQuestions,
      hasDoubtSignals: hasDoubtInThread,
      isSameTopicThread: false,
    };
  }

  const recentSets = bucketSets.slice(-3);
  const sharedRecent = sharedBucketIds(recentSets);
  const unionRecent = unionBucketIds(recentSets);
  const doubtSpiral =
    doubtFlags.slice(-3).filter(Boolean).length >= 2 &&
    unionRecent.length > 0;

  const isSameTopicThread =
    sharedRecent.length > 0 ||
    doubtSpiral ||
    (hasDoubtInThread && unionBucketIds(bucketSets).length > 0);

  const labelSource = sharedRecent.length > 0 ? sharedRecent : unionBucketIds(bucketSets);
  const sharedTopicLabels = bucketsToLabels(labelSource);

  const currentHasDoubt = doubtFlags.at(-1) ?? false;
  const priorDoubt = doubtFlags.slice(0, -1).some(Boolean);

  let mode: TopicAccompanimentMode = "fresh";
  if (isSameTopicThread) {
    mode = currentHasDoubt && (priorDoubt || userTurn >= 3) ? "recheck" : "ongoing";
  }

  return {
    mode,
    userTurn,
    sharedTopicLabels,
    recentUserQuestions,
    hasDoubtSignals: hasDoubtInThread,
    isSameTopicThread,
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
      "Пользователь снова сомневается в том же выводе.",
      "Посмотри карту другим углом (другой дом, управитель, слой, горизонт).",
      "Если картина не меняется — профессионально скажи, например:",
      "«Я ещё раз посмотрел карту другим способом. Основной вывод не изменился. Новых факторов, которые существенно меняют картину, сейчас не вижу.»",
      "Это хороший ответ. Не выдумывай новые трактовки ради новизны.",
    );
  }

  return `${lines.join("\n")}\n`;
}
