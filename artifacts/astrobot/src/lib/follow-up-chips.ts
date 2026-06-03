export type FollowUpChip = {
  /** Стабильный смысловой ключ ветки — для дедупа в рамках темы */
  intentId: string;
  label: string;
  prompt: string;
  isAffirm?: boolean;
};

const AFFIRM_INTENT = 'hook.affirm';

const AFFIRM_CHIP: FollowUpChip = {
  intentId: AFFIRM_INTENT,
  label: 'Да, расскажи подробнее',
  prompt: 'Да, расскажи подробнее',
  isAffirm: true,
};

const MAX_TOPIC_CHIPS = 3;

/** Универсальные «пустые» вопросы — не показываем */
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

/** Последний абзац похож на приглашение продолжить разбор */
export function detectInvitationHook(assistantText: string): boolean {
  const trimmed = assistantText.trim();
  if (!trimmed) return false;
  const tail = trimmed.slice(Math.max(0, trimmed.length - 600));
  const lastBlock = tail.split(/\n\s*\n/).pop()?.trim() || tail;
  const invite =
    /(?:хочешь|хотите|если\s+(?:хочешь|интересно)|могу\s+(?:разобрать|посмотреть)|можно\s+(?:отдельно|посмотреть)|есть\s+ещ[ёе]|интересн(?:ый|ая|ое)\s+(?:слой|момент)|разбер[её]м|разобрать|посмотрим|углубить|продолжим)/i;
  const asks = /\?/.test(lastBlock.slice(-160));
  return invite.test(lastBlock) && (asks || /подробн|дальше|отдельно|этот\s+(?:слой|момент|аспект)/i.test(lastBlock));
}

type TopicKey =
  | 'relations'
  | 'child'
  | 'money'
  | 'career'
  | 'people'
  | 'health'
  | 'default';

type ChipTemplate = {
  intentId: string;
  topics: TopicKey[];
  signals: RegExp[];
  label: string;
  prompt: string;
  weight?: number;
};

/** Контекстные follow-up: только если тема есть в последнем ответе ассистента */
const CHIP_TEMPLATES: ChipTemplate[] = [
  // —— career ——
  {
    intentId: 'career.use_potential',
    topics: ['career'],
    signals: [/потенциал/i, /реализац/i, /сильн\w*\s+сторон/i, /предназнач/i, /призван/i],
    label: 'Как мне использовать этот потенциал в работе?',
    prompt: 'Как мне использовать этот потенциал в работе по карте?',
    weight: 2,
  },
  {
    intentId: 'career.sphere',
    topics: ['career'],
    signals: [/сфер/i, /раскры/i, /професс/i, /направлен/i, /соляр/i],
    label: 'В какой сфере я могу раскрыться сильнее?',
    prompt: 'В какой сфере я могу раскрыться сильнее по карте?',
    weight: 2,
  },
  {
    intentId: 'career.main_now',
    topics: ['career'],
    signals: [/карьер/i, /главн/i, /приоритет/i, /фокус/i, /сейчас\s+важн/i],
    label: 'Что сейчас главное для моей карьеры?',
    prompt: 'Что сейчас главное для моей карьеры по карте?',
    weight: 2,
  },
  {
    intentId: 'career.blockers',
    topics: ['career'],
    signals: [/мешает/i, /блок/i, /уровень/i, /препятств/i, /тормоз/i, /напряжен/i],
    label: 'Что мешает мне выйти на новый уровень?',
    prompt: 'Что по карте мешает мне выйти на новый уровень в карьере?',
    weight: 2,
  },
  {
    intentId: 'career.solar_profession',
    topics: ['career'],
    signals: [/соляр/i, /професс/i],
    label: 'Как соляр связан с моей профессией?',
    prompt: 'Как соляр связан с моей профессией и реализацией?',
    weight: 3,
  },
  {
    intentId: 'career.format_change',
    topics: ['career'],
    signals: [/смен/i, /формат/i, /увольн/i, /переход/i, /свой\s+проект/i],
    label: 'Стоит ли менять формат работы сейчас?',
    prompt: 'Стоит ли мне менять формат работы сейчас по карте?',
  },
  {
    intentId: 'career.timing_step',
    topics: ['career'],
    signals: [/когда/i, /срок/i, /окно/i, /период/i, /транзит/i],
    label: 'Когда лучше делать следующий шаг в карьере?',
    prompt: 'Когда по карте лучше делать следующий шаг в карьере?',
  },

  // —— relations ——
  {
    intentId: 'relations.tension',
    topics: ['relations'],
    signals: [/напряжен|напряжён/i, /конфликт/i, /ссор/i, /тяжел|тяжёл/i],
    label: 'Что делать с этим напряжением между нами?',
    prompt: 'Что делать с этим напряжением между нами по карте?',
    weight: 2,
  },
  {
    intentId: 'relations.temporal',
    topics: ['relations'],
    signals: [/временн/i, /паттерн/i, /постоянн/i, /период\s+или/i, /пройд[её]т/i],
    label: 'Это у нас временный этап или устойчивый паттерн?',
    prompt: 'Это у нас временный этап или устойчивый паттерн по карте?',
    weight: 2,
  },
  {
    intentId: 'relations.partner_view',
    topics: ['relations'],
    signals: [/воспринимает/i, /думает/i, /его\s+взгляд/i, /её\s+взгляд/i, /позици/i],
    label: 'Как он воспринимает то, что сейчас происходит?',
    prompt: 'Как он воспринимает то, что сейчас происходит между нами?',
    weight: 2,
  },
  {
    intentId: 'relations.dynamics',
    topics: ['relations'],
    signals: [/динамик/i, /взаимодейств/i, /цепляет/i, /триггер/i, /между\s+вами/i],
    label: 'Почему меня так цепляет в этой связи?',
    prompt: 'Почему меня так цепляет в этой связи по карте?',
    weight: 2,
  },
  {
    intentId: 'relations.compatibility_layer',
    topics: ['relations'],
    signals: [/совместим/i, /синастр/i, /связь/i, /пара/i],
    label: 'Что в нашей связи сейчас самое чувствительное?',
    prompt: 'Что в нашей связи сейчас самое чувствительное по карте?',
  },

  // —— child ——
  {
    intentId: 'child.parent_focus',
    topics: ['child'],
    signals: [/родител/i, /ребён/i, /ребен/i, /внимани/i],
    label: 'На что родителям обратить внимание сейчас?',
    prompt: 'На что родителям обратить внимание сейчас по карте ребёнка?',
    weight: 2,
  },
  {
    intentId: 'child.talent_support',
    topics: ['child'],
    signals: [/талант/i, /способност/i, /развить/i, /поддержать/i],
    label: 'Как поддержать этот талант ребёнка?',
    prompt: 'Как поддержать этот талант ребёнка по карте?',
    weight: 2,
  },
  {
    intentId: 'child.difficulties',
    topics: ['child'],
    signals: [/сложност/i, /трудност/i, /риск/i, /тяжело/i],
    label: 'Где у ребёнка могут быть сложности?',
    prompt: 'Где у ребёнка могут быть сложности по карте?',
  },
  {
    intentId: 'child.communication',
    topics: ['child'],
    signals: [/общени/i, /контакт/i, /разговарив/i],
    label: 'Как улучшить наше общение с ребёнком?',
    prompt: 'Как улучшить наше общение с ребёнком по карте?',
  },
  {
    intentId: 'child.activities',
    topics: ['child'],
    signals: [/кружк/i, /занят/i, /хобби/i, /секци/i],
    label: 'Какие занятия могут подойти ребёнку?',
    prompt: 'Какие занятия или кружки могут подойти ребёнку по карте?',
  },

  // —— people ——
  {
    intentId: 'people.opportunity',
    topics: ['people'],
    signals: [/возможност/i, /окно/i, /шанс/i, /новые\s+люди/i, /окружен/i],
    label: 'Что сделать, чтобы воспользоваться этой возможностью?',
    prompt: 'Что мне сделать, чтобы воспользоваться этой возможностью по карте?',
    weight: 2,
  },
  {
    intentId: 'people.timing',
    topics: ['people'],
    signals: [/встреч/i, /знакомств/i, /появлени\w*\s+человек/i],
    label: 'Когда вероятна встреча такого человека?',
    prompt: 'Когда вероятна встреча такого человека по карте?',
    weight: 2,
  },
  {
    intentId: 'people.old_ties',
    topics: ['people'],
    signals: [/стары\w*\s+друз/i, /прошлы\w*\s+связ/i, /стары\w*\s+связ/i],
    label: 'Что делать со старыми друзьями в этой ситуации?',
    prompt: 'Что делать со старыми друзьями в этой ситуации по карте?',
    weight: 2,
  },
  {
    intentId: 'people.where_find',
    topics: ['people'],
    signals: [/где\s+искать/i, /где\s+найти/i, /где\s+встретить/i],
    label: 'Где искать таких людей сейчас?',
    prompt: 'Где искать таких людей сейчас по карте?',
  },
  {
    intentId: 'people.ideal_match',
    topics: ['people'],
    signals: [/идеальн\w*\s+друг/i, /соратник/i, /свои\s+люди/i, /подходит/i],
    label: 'Какой человек мне подходит по карте?',
    prompt: 'Как по карте выглядит человек, который мне подходит?',
  },

  // —— money ——
  {
    intentId: 'money.week_action',
    topics: ['money'],
    signals: [/недел/i, /ближайш/i, /шаг/i],
    label: 'Что по деньгам важно на этой неделе?',
    prompt: 'Что по деньгам важно сделать на этой неделе по карте?',
    weight: 2,
  },
  {
    intentId: 'money.income_format',
    topics: ['money'],
    signals: [/доход/i, /заработ/i, /источник/i, /формат/i],
    label: 'Какой формат дохода сейчас уместнее?',
    prompt: 'Какой формат дохода сейчас для меня уместнее по карте?',
    weight: 2,
  },
  {
    intentId: 'money.support',
    topics: ['money', 'career'],
    signals: [/опор/i, /опереться/i, /ресурс/i, /держит/i],
    label: 'На что опереться в финансах сейчас?',
    prompt: 'На что мне опереться в финансах сейчас по карте?',
  },
  {
    intentId: 'money.timing',
    topics: ['money'],
    signals: [/когда/i, /срок/i, /ясн/i, /период/i],
    label: 'Когда по карте станет яснее с деньгами?',
    prompt: 'Когда по карте станет яснее с деньгами?',
  },

  // —— health ——
  {
    intentId: 'health.focus',
    topics: ['health'],
    signals: [/здоров/i, /самочувств/i, /бодрост/i, /энерг/i],
    label: 'На что обратить внимание по здоровью сейчас?',
    prompt: 'На что обратить внимание по здоровью сейчас по карте?',
    weight: 2,
  },
  {
    intentId: 'health.duration',
    topics: ['health'],
    signals: [/временн/i, /постоянн/i, /период\s+или/i, /паттерн/i],
    label: 'Это временный период или устойчивая тема в карте?',
    prompt: 'Это временный период или устойчивая тема в карте по здоровью?',
  },
  {
    intentId: 'health.support',
    topics: ['health'],
    signals: [/поддерж/i, /ресурс/i, /восстанов/i],
    label: 'Что поддержит меня по здоровью сейчас?',
    prompt: 'Что по карте поддержит меня по здоровью сейчас?',
  },

  // —— default (только при явных сигналах в ответе) ——
  {
    intentId: 'default.period_meaning',
    topics: ['default'],
    signals: [/период/i, /транзит/i, /фаза/i, /цикл/i],
    label: 'Что этот период значит для меня сейчас?',
    prompt: 'Что этот период значит для меня сейчас по карте?',
    weight: 2,
  },
  {
    intentId: 'default.line_deeper',
    topics: ['default'],
    signals: [/линия/i, /аспект/i, /положени/i, /сигнал/i, /✦/],
    label: 'Разбери глубже самую сильную линию из ответа',
    prompt: 'Разбери глубже самую сильную линию из твоего ответа',
    weight: 1,
  },
  {
    intentId: 'default.life_manifest',
    topics: ['default'],
    signals: [/прояв/i, /жизн/i, /быт/i, /наблюда/i],
    label: 'Как это может проявиться в моей жизни?',
    prompt: 'Как это из ответа может проявиться в моей жизни по карте?',
  },
];

const TOPIC_INTENT_IDS: Record<TopicKey, string[]> = {
  relations: [],
  child: [],
  money: [],
  career: [],
  people: [],
  health: [],
  default: [],
};

for (const t of CHIP_TEMPLATES) {
  for (const topic of t.topics) {
    if (!TOPIC_INTENT_IDS[topic].includes(t.intentId)) {
      TOPIC_INTENT_IDS[topic].push(t.intentId);
    }
  }
}

/** Сигналы в user-сообщениях → уже открытый intent */
const INTENT_FROM_USER_TEXT: Record<string, RegExp[]> = {
  [AFFIRM_INTENT]: [
    /^да[,.]?\s*(расскажи|разбери|посмотри|покажи)/i,
    /^давай[,.]?\s*(расскажи|разбери|подробн)/i,
    /^расскажи подробнее/i,
    /^да[,.]?\s*$/i,
    /^ок[,.]?\s*(расскажи|давай)?/i,
    /^конечно[,.]?\s*(расскажи)?/i,
  ],
  'career.use_potential': [/потенциал.*работ|использовать.*потенциал/i],
  'career.sphere': [/в какой сфере|раскрыться сильнее/i],
  'career.main_now': [/главное для.*карьер/i],
  'career.blockers': [/мешает.*уровень|новый уровень/i],
  'career.solar_profession': [/соляр.*професс/i],
  'career.format_change': [/менять формат работ/i],
  'career.timing_step': [/следующий шаг.*карьер/i],
  'relations.tension': [/напряжен|что делать с этим напряжен/i],
  'relations.temporal': [/временн|паттерн|устойчив/i],
  'relations.partner_view': [/воспринимает|как он/i, /как она/i],
  'relations.dynamics': [/цепляет|почему меня так/i],
  'relations.compatibility_layer': [/самое чувствительное/i],
  'child.parent_focus': [/родител.*вниман/i],
  'child.talent_support': [/поддержать.*талант/i],
  'child.difficulties': [/сложност.*реб/i],
  'child.communication': [/общение.*реб/i],
  'child.activities': [/занятия|кружк/i],
  'people.opportunity': [/воспользоваться.*возможност/i],
  'people.timing': [/когда.*встреч/i],
  'people.old_ties': [/стары.*друз/i],
  'people.where_find': [/где искать/i],
  'people.ideal_match': [/какой человек.*подходит/i],
  'money.week_action': [/деньг.*недел/i],
  'money.income_format': [/формат дохода/i],
  'money.support': [/опереться.*финанс/i],
  'money.timing': [/яснее.*деньг/i],
  'health.focus': [/здоровь.*вниман/i],
  'health.duration': [/временн|устойчив.*здоров/i],
  'health.support': [/поддержит.*здоров/i],
  'default.period_meaning': [/период значит/i],
  'default.line_deeper': [/глубже.*линию/i],
  'default.life_manifest': [/проявиться.*жизн/i],
};

function assistantFocusText(assistantText: string): string {
  const trimmed = assistantText.trim();
  if (!trimmed) return '';
  return trimmed.slice(Math.max(0, trimmed.length - 2800)).toLowerCase();
}

function isGenericChip(chip: Pick<FollowUpChip, 'label' | 'prompt'>): boolean {
  const text = `${chip.label} ${chip.prompt}`;
  return GENERIC_CHIP_PATTERNS.some((re) => re.test(chip.label) || re.test(chip.prompt) || re.test(text));
}

function templateMatchesAssistant(template: ChipTemplate, assistantText: string): boolean {
  const focus = assistantFocusText(assistantText);
  if (!focus) return false;
  return template.signals.some((re) => re.test(focus));
}

function templateRelevanceScore(template: ChipTemplate, assistantText: string): number {
  const focus = assistantFocusText(assistantText);
  const hits = template.signals.filter((re) => re.test(focus)).length;
  return hits + (template.weight ?? 0);
}

function classifyTopicFromText(text: string, hasContact: boolean): TopicKey {
  const t = text.toLowerCase();
  if (!t.trim()) return 'default';
  if (/(ребён|ребен|дочь|сын|родител|школ|круж)/.test(t)) return 'child';
  if (
    hasContact &&
    /(отношен|синастр|партн|муж|жена|парень|девушк|бесит|ссор|конфликт|триггер|между нами|совместим)/.test(t)
  ) {
    return 'relations';
  }
  if (/(соратник|друг|знаком|встреч|окружен|сообществ|ищу людей|новые люди|своих людей)/.test(t)) return 'people';
  if (/(деньг|доход|финанс|зарплат|оплат|бюджет)/.test(t)) return 'money';
  if (/(карьер|работ|увольн|повышен|проект|бизнес|предназнач|професс|реализац|соляр)/.test(t)) return 'career';
  if (/(здоров|болезн|анализ|самочувств)/.test(t)) return 'health';
  if (hasContact) return 'relations';
  return 'default';
}

function classifyTopic(assistantText: string, lastUserText: string, hasContact: boolean): TopicKey {
  const fromAssistant = classifyTopicFromText(assistantText, hasContact);
  if (fromAssistant !== 'default') return fromAssistant;
  return classifyTopicFromText(lastUserText, hasContact);
}

function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Какие смысловые ветки уже открыты в этой теме (по истории user-сообщений) */
export function collectExploredIntents(userMessages: string[], topic: TopicKey): Set<string> {
  const explored = new Set<string>();
  const topicIntentSet = new Set(TOPIC_INTENT_IDS[topic]);

  for (const raw of userMessages) {
    const msg = raw.trim();
    if (!msg) continue;
    const normalized = normalizeForDedup(msg);

    for (const [intentId, patterns] of Object.entries(INTENT_FROM_USER_TEXT)) {
      if (!topicIntentSet.has(intentId) && intentId !== AFFIRM_INTENT) continue;
      if (patterns.some((re) => re.test(msg) || re.test(normalized))) {
        explored.add(intentId);
      }
    }

    for (const template of CHIP_TEMPLATES) {
      if (!template.topics.includes(topic)) continue;
      const p = normalizeForDedup(template.prompt);
      if (p.length >= 10 && (normalized.includes(p) || p.includes(normalized))) {
        explored.add(template.intentId);
      }
    }
  }

  return explored;
}

function isChipRedundantWithHistory(chip: FollowUpChip, userMessages: string[]): boolean {
  const p = normalizeForDedup(chip.prompt);
  if (p.length < 8) return false;
  return userMessages.some((raw) => {
    const u = normalizeForDedup(raw);
    return u.length >= 8 && (u.includes(p) || p.includes(u));
  });
}

function templateToChip(template: ChipTemplate): FollowUpChip {
  return {
    intentId: template.intentId,
    label: template.label,
    prompt: template.prompt,
  };
}

function pickContextualChips(
  topic: TopicKey,
  assistantText: string,
  exploredIntents: Set<string>,
  userMessages: string[],
  limit: number,
): FollowUpChip[] {
  const out: FollowUpChip[] = [];
  const seen = new Set<string>();

  const candidates = CHIP_TEMPLATES.filter((t) => t.topics.includes(topic))
    .filter((t) => templateMatchesAssistant(t, assistantText))
    .filter((t) => !isGenericChip(templateToChip(t)))
    .sort((a, b) => templateRelevanceScore(b, assistantText) - templateRelevanceScore(a, assistantText));

  for (const template of candidates) {
    if (out.length >= limit) break;
    const chip = templateToChip(template);
    if (exploredIntents.has(chip.intentId)) continue;
    if (seen.has(chip.intentId)) continue;
    if (isChipRedundantWithHistory(chip, userMessages)) continue;
    seen.add(chip.intentId);
    out.push(chip);
  }

  return out;
}

export function buildFollowUpChips(
  assistantText: string,
  userMessages: string[],
  options: { hasContact?: boolean } = {},
): FollowUpChip[] {
  const hasContact = Boolean(options.hasContact);
  const lastUserText = userMessages[userMessages.length - 1] || '';
  const topic = classifyTopic(assistantText, lastUserText, hasContact);
  const exploredIntents = collectExploredIntents(userMessages, topic);

  const withHook = detectInvitationHook(assistantText);
  const topicChips = pickContextualChips(
    topic,
    assistantText,
    exploredIntents,
    userMessages,
    MAX_TOPIC_CHIPS,
  );

  const showAffirm = withHook && !exploredIntents.has(AFFIRM_INTENT);
  if (showAffirm) {
    return [AFFIRM_CHIP, ...topicChips].slice(0, MAX_TOPIC_CHIPS + 1);
  }
  return topicChips;
}
