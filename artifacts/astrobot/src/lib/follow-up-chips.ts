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

/** Сигналы в user-сообщениях → уже открытый intent (не только дословный текст чипа) */
const INTENT_FROM_USER_TEXT: Record<string, RegExp[]> = {
  [AFFIRM_INTENT]: [
    /^да[,.]?\s*(расскажи|разбери|посмотри|покажи)/i,
    /^давай[,.]?\s*(расскажи|разбери|подробн)/i,
    /^расскажи подробнее/i,
    /^да[,.]?\s*$/i,
    /^ок[,.]?\s*(расскажи|давай)?/i,
    /^конечно[,.]?\s*(расскажи)?/i,
  ],
  'relations.tension': [
    /напряжен|напряжён|что делать с этим|как быть с этим конфликт|ссор|бесит|триггер/i,
  ],
  'relations.temporal': [
    /временн|паттерн|постоянн|навсегда|период или|это пройд[её]т|долго ли/i,
  ],
  'relations.partner_view': [
    /как он воспринимает|что он думает|его взгляд|как она воспринимает|что она думает|его позиция/i,
  ],
  'relations.help_now': [
    /что поможет сейчас|что делать сейчас|как действовать сейчас|первый шаг|с чего начать/i,
  ],
  'relations.dynamics': [
    /динамик|как мы взаимодейств|почему так между|механик|почему меня триггерит/i,
  ],
  'child.parent_focus': [
    /на что обратить внимание родител|что важно родител|как понять ребён|как понять ребен/i,
  ],
  'child.activities': [
    /кружк|занят|секци|хобби|куда отдать|чем занять/i,
  ],
  'child.difficulties': [
    /сложност|трудност|где будет тяжело|риск|проблем/i,
  ],
  'child.talent_support': [
    /талант|поддержать|развить|способност/i,
  ],
  'child.communication': [
    /общени|разговарив|контакт с ребён|контакт с ребен/i,
  ],
  'people.opportunity': [
    /воспользоваться возможност|использовать возможност|как действовать.*возможност/i,
  ],
  'people.timing': [
    /когда вероятна встреч|когда встречу|когда появится|срок.*встреч/i,
  ],
  'people.old_ties': [
    /старые друз|старым друз|прошлые связ|старые связ/i,
  ],
  'people.where_find': [
    /где искать|где найти|где встретить|как найти таких/i,
  ],
  'people.ideal_match': [
    /идеальн.*друг|какой человек мне|соратник|свои люди/i,
  ],
  'money.week_action': [
    /на этой неделе|что делать.*деньг|ближайш.*шаг.*финанс/i,
  ],
  'money.timing': [
    /когда станет яснее|когда.*деньг|когда.*финанс|срок/i,
  ],
  'money.support': [
    /на что опереться|опора.*деньг|что держит|ресурс.*финанс/i,
  ],
  'money.income_format': [
    /формат.*заработ|источник.*доход|как зарабатывать/i,
  ],
  'career.direction': [
    /куда двигаться|куда идти|направление.*карьер|что дальше.*работ/i,
  ],
  'career.format_change': [
    /менять формат|сменить работ|увольн|свой проект|фриланс/i,
  ],
  'career.timing': [
    /когда.*действовать|когда.*работ|лучшее время/i,
  ],
  'health.focus': [
    /на что обратить внимание.*здоров|здоровь|самочувств/i,
  ],
  'health.duration': [
    /временн.*здоров|постоянн.*тема|период или.*здоров/i,
  ],
  'health.support': [
    /что поддержит|ресурс.*здоров|как поддержать себя/i,
  ],
  'default.priority': [
    /что важнее всего|главное сейчас|приоритет/i,
  ],
  'default.practice': [
    /на практике|как проявится|в жизни|быт/i,
  ],
  'default.attention': [
    /на что обратить внимание|ближайш.*недел|следить/i,
  ],
};

const POOLS: Record<TopicKey, FollowUpChip[]> = {
  relations: [
    { intentId: 'relations.tension', label: 'Что делать с этим напряжением?', prompt: 'Что делать с этим напряжением?' },
    { intentId: 'relations.temporal', label: 'Это временный период или паттерн?', prompt: 'Это временный период или паттерн?' },
    { intentId: 'relations.partner_view', label: 'Как он воспринимает эту ситуацию?', prompt: 'Как он воспринимает эту ситуацию?' },
    { intentId: 'relations.help_now', label: 'Что поможет сейчас?', prompt: 'Что поможет сейчас?' },
    { intentId: 'relations.dynamics', label: 'Почему нас так цепляет друг друга?', prompt: 'Почему нас так цепляет в этой связи?' },
  ],
  child: [
    { intentId: 'child.parent_focus', label: 'На что обратить внимание родителям?', prompt: 'На что обратить внимание родителям?' },
    { intentId: 'child.activities', label: 'Какие занятия могут подойти?', prompt: 'Какие занятия или кружки могут подойти ребёнку?' },
    { intentId: 'child.difficulties', label: 'Где могут быть сложности?', prompt: 'Где у ребёнка могут быть сложности?' },
    { intentId: 'child.talent_support', label: 'Как поддержать этот талант?', prompt: 'Как поддержать этот талант?' },
    { intentId: 'child.communication', label: 'Как улучшить наше общение?', prompt: 'Как улучшить наше общение с ребёнком?' },
  ],
  people: [
    {
      intentId: 'people.opportunity',
      label: 'Что сделать, чтобы воспользоваться возможностью?',
      prompt: 'Что мне сделать, чтобы воспользоваться этой возможностью?',
    },
    { intentId: 'people.timing', label: 'Когда вероятна встреча?', prompt: 'Когда вероятна встреча такого человека?' },
    { intentId: 'people.old_ties', label: 'Что делать со старыми друзьями?', prompt: 'Что делать со старыми друзьями?' },
    { intentId: 'people.where_find', label: 'Где искать таких людей?', prompt: 'Где искать таких людей?' },
    { intentId: 'people.ideal_match', label: 'Какой человек мне подходит?', prompt: 'Как по карте выглядит человек, который мне подходит?' },
  ],
  money: [
    { intentId: 'money.week_action', label: 'Что делать на этой неделе?', prompt: 'Что делать на этой неделе по деньгам?' },
    { intentId: 'money.timing', label: 'Когда станет яснее?', prompt: 'Когда по карте станет яснее с деньгами?' },
    { intentId: 'money.support', label: 'На что опереться сейчас?', prompt: 'На что мне опереться сейчас по карте?' },
    { intentId: 'money.income_format', label: 'Какой формат дохода сейчас уместен?', prompt: 'Какой формат дохода сейчас для меня уместен по карте?' },
  ],
  career: [
    { intentId: 'career.direction', label: 'Куда двигаться дальше?', prompt: 'Куда мне двигаться дальше в карьере?' },
    { intentId: 'career.format_change', label: 'Стоит ли менять формат работы?', prompt: 'Стоит ли менять формат работы?' },
    { intentId: 'career.timing', label: 'Когда лучше действовать?', prompt: 'Когда по карте лучше действовать?' },
    { intentId: 'money.support', label: 'На что опереться в работе?', prompt: 'На что опереться в карьере сейчас по карте?' },
  ],
  health: [
    { intentId: 'health.focus', label: 'На что обратить внимание?', prompt: 'На что обратить внимание по здоровью?' },
    { intentId: 'health.duration', label: 'Это период или постоянная тема?', prompt: 'Это временный период или постоянная тема в карте?' },
    { intentId: 'health.support', label: 'Что поддержит сейчас?', prompt: 'Что по карте поддержит меня сейчас?' },
    { intentId: 'default.attention', label: 'Что важно в ближайшие недели?', prompt: 'На что обратить внимание по здоровью в ближайшие недели?' },
  ],
  default: [
    { intentId: 'default.priority', label: 'Что важнее всего сейчас?', prompt: 'Что важнее всего сейчас по карте?' },
    { intentId: 'default.practice', label: 'Как это проявится на практике?', prompt: 'Как это может проявиться на практике?' },
    { intentId: 'default.attention', label: 'На что обратить внимание?', prompt: 'На что обратить внимание в ближайшие недели?' },
    { intentId: 'money.timing', label: 'Когда лучшее время для шага?', prompt: 'Когда по карте лучшее время для следующего шага?' },
  ],
};

const TOPIC_INTENT_IDS: Record<TopicKey, string[]> = {
  relations: ['relations.tension', 'relations.temporal', 'relations.partner_view', 'relations.help_now', 'relations.dynamics'],
  child: ['child.parent_focus', 'child.activities', 'child.difficulties', 'child.talent_support', 'child.communication'],
  people: ['people.opportunity', 'people.timing', 'people.old_ties', 'people.where_find', 'people.ideal_match'],
  money: ['money.week_action', 'money.timing', 'money.support', 'money.income_format'],
  career: ['career.direction', 'career.format_change', 'career.timing', 'money.support'],
  health: ['health.focus', 'health.duration', 'health.support', 'default.attention'],
  default: ['default.priority', 'default.practice', 'default.attention', 'money.timing'],
};

function classifyTopic(combined: string, hasContact: boolean): TopicKey {
  const t = combined.toLowerCase();
  if (/(ребён|ребен|дочь|сын|родител|школ|круж)/.test(t)) return 'child';
  if (
    hasContact &&
    /(отношен|синастр|партн|муж|жена|парень|девушк|бесит|ссор|конфликт|триггер|между нами|совместим)/.test(t)
  ) {
    return 'relations';
  }
  if (/(соратник|друг|знаком|встреч|окружен|сообществ|ищу людей|новые люди|своих людей)/.test(t)) return 'people';
  if (/(деньг|доход|финанс|зарплат|оплат|бюджет)/.test(t)) return 'money';
  if (/(карьер|работ|увольн|повышен|проект|бизнес)/.test(t)) return 'career';
  if (/(здоров|болезн|анализ|самочувств)/.test(t)) return 'health';
  if (hasContact) return 'relations';
  return 'default';
}

function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Какие смысловые ветки уже открыты в этой теме (по всей истории user-сообщений) */
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

    for (const chip of POOLS[topic]) {
      const p = normalizeForDedup(chip.prompt);
      if (p.length >= 10 && (normalized.includes(p) || p.includes(normalized))) {
        explored.add(chip.intentId);
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

function pickTopicChips(
  pool: FollowUpChip[],
  exploredIntents: Set<string>,
  userMessages: string[],
  limit: number,
): FollowUpChip[] {
  const out: FollowUpChip[] = [];
  const seen = new Set<string>();

  const tryAdd = (chip: FollowUpChip) => {
    if (out.length >= limit) return;
    if (chip.isAffirm) return;
    if (exploredIntents.has(chip.intentId)) return;
    if (seen.has(chip.intentId)) return;
    if (isChipRedundantWithHistory(chip, userMessages)) return;
    seen.add(chip.intentId);
    out.push(chip);
  };

  for (const chip of pool) tryAdd(chip);

  if (out.length < limit) {
    for (const chip of POOLS.default) tryAdd(chip);
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
  const combined = `${userMessages.join('\n')}\n${assistantText}`;
  const topic = classifyTopic(combined, hasContact);
  const pool = POOLS[topic];
  const exploredIntents = collectExploredIntents(userMessages, topic);

  const withHook = detectInvitationHook(assistantText);
  const maxTotal = 4;
  const topicLimit = withHook ? maxTotal - 1 : maxTotal;
  const topicChips = pickTopicChips(pool, exploredIntents, userMessages, topicLimit);

  const showAffirm = withHook && !exploredIntents.has(AFFIRM_INTENT);
  if (showAffirm) {
    return [AFFIRM_CHIP, ...topicChips].slice(0, maxTotal);
  }
  return topicChips.slice(0, maxTotal);
}
