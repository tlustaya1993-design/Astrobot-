export type FollowUpChip = {
  label: string;
  prompt: string;
  isAffirm?: boolean;
};

const AFFIRM_CHIP: FollowUpChip = {
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

const POOLS: Record<TopicKey, FollowUpChip[]> = {
  relations: [
    { label: 'Что делать с этим напряжением?', prompt: 'Что делать с этим напряжением?' },
    { label: 'Это временный период или паттерн?', prompt: 'Это временный период или паттерн?' },
    { label: 'Как он воспринимает эту ситуацию?', prompt: 'Как он воспринимает эту ситуацию?' },
    { label: 'Что поможет сейчас?', prompt: 'Что поможет сейчас?' },
  ],
  child: [
    { label: 'На что обратить внимание родителям?', prompt: 'На что обратить внимание родителям?' },
    { label: 'Какие занятия могут подойти?', prompt: 'Какие занятия или кружки могут подойти ребёнку?' },
    { label: 'Где могут быть сложности?', prompt: 'Где у ребёнка могут быть сложности?' },
    { label: 'Как поддержать этот талант?', prompt: 'Как поддержать этот талант?' },
  ],
  people: [
    {
      label: 'Что сделать, чтобы воспользоваться возможностью?',
      prompt: 'Что мне сделать, чтобы воспользоваться этой возможностью?',
    },
    { label: 'Когда вероятна встреча?', prompt: 'Когда вероятна встреча такого человека?' },
    { label: 'Что делать со старыми друзьями?', prompt: 'Что делать со старыми друзьями?' },
    { label: 'Где искать таких людей?', prompt: 'Где искать таких людей?' },
  ],
  money: [
    { label: 'Что делать на этой неделе?', prompt: 'Что делать на этой неделе по деньгам?' },
    { label: 'Когда станет яснее?', prompt: 'Когда по карте станет яснее с деньгами?' },
    { label: 'На что опереться сейчас?', prompt: 'На что мне опереться сейчас по карте?' },
  ],
  career: [
    { label: 'Куда двигаться дальше?', prompt: 'Куда мне двигаться дальше в карьере?' },
    { label: 'Стоит ли менять формат работы?', prompt: 'Стоит ли менять формат работы?' },
    { label: 'Когда лучше действовать?', prompt: 'Когда по карте лучше действовать?' },
  ],
  health: [
    { label: 'На что обратить внимание?', prompt: 'На что обратить внимание по здоровью?' },
    { label: 'Это период или постоянная тема?', prompt: 'Это временный период или постоянная тема в карте?' },
    { label: 'Что поддержит сейчас?', prompt: 'Что по карте поддержит меня сейчас?' },
  ],
  default: [
    { label: 'Что важнее всего сейчас?', prompt: 'Что важнее всего сейчас по карте?' },
    { label: 'Как это проявится на практике?', prompt: 'Как это может проявиться на практике?' },
    { label: 'На что обратить внимание?', prompt: 'На что обратить внимание в ближайшие недели?' },
  ],
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

function isTooSimilarToUser(chip: FollowUpChip, userText: string): boolean {
  const u = normalizeForDedup(userText);
  if (!u) return false;
  const p = normalizeForDedup(chip.prompt);
  if (p.length >= 12 && (u.includes(p) || p.includes(u))) return true;
  return false;
}

function pickTopicChips(pool: FollowUpChip[], userText: string, limit: number): FollowUpChip[] {
  const out: FollowUpChip[] = [];
  for (const chip of pool) {
    if (out.length >= limit) break;
    if (isTooSimilarToUser(chip, userText)) continue;
    if (out.some((c) => normalizeForDedup(c.prompt) === normalizeForDedup(chip.prompt))) continue;
    out.push(chip);
  }
  if (out.length < limit) {
    for (const chip of POOLS.default) {
      if (out.length >= limit) break;
      if (isTooSimilarToUser(chip, userText)) continue;
      if (out.some((c) => normalizeForDedup(c.prompt) === normalizeForDedup(chip.prompt))) continue;
      out.push(chip);
    }
  }
  return out;
}

export function buildFollowUpChips(
  assistantText: string,
  lastUserText: string,
  options: { hasContact?: boolean } = {},
): FollowUpChip[] {
  const hasContact = Boolean(options.hasContact);
  const combined = `${lastUserText}\n${assistantText}`;
  const topic = classifyTopic(combined, hasContact);
  const pool = POOLS[topic];

  const withHook = detectInvitationHook(assistantText);
  const maxTotal = 4;
  const topicLimit = withHook ? maxTotal - 1 : maxTotal;
  const topicChips = pickTopicChips(pool, lastUserText, topicLimit);

  if (withHook) {
    return [AFFIRM_CHIP, ...topicChips].slice(0, maxTotal);
  }
  return topicChips.slice(0, maxTotal);
}
