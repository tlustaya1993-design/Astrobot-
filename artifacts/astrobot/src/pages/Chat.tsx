import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Send, Sparkles, ChevronLeft, Copy, RotateCcw, MessageSquare, User } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useTutorial, isTutorialDone, FRESH_ONBOARDING_KEY } from '@/context/TutorialContext';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  useGetOpenaiConversation,
  getGetOpenaiConversationQueryKey,
  getListOpenaiConversationsQueryKey,
} from '@workspace/api-client-react';
import { getAuthHeaders, getSessionId } from '@/lib/session';
import { useChatStream } from '@/hooks/use-chat-stream';
import AstroMarkdown from '@/components/chat/AstroMarkdown';
import PeoplePanel from '@/components/chat/PeoplePanel';
import ContactAnalysisModeScreen from '@/components/chat/ContactAnalysisModeScreen';
import ContactHeaderModeSwitch from '@/components/chat/ContactHeaderModeSwitch';
import { ChatOnboardingOverlay, type ChatOnboardingPhase } from '@/components/chat/ChatOnboardingOverlay';
import HistoryDrawer from '@/components/chat/HistoryDrawer';
import AuthModal from '@/components/AuthModal';
import DailyForecastCard from '@/components/chat/DailyForecastCard';
import PaywallSheet from '@/components/billing/PaywallSheet';
import ProfileSheet from '@/components/profile/ProfileSheet';
import PwaInstallBanner, { type PwaInstallBannerHandle } from '@/components/pwa/PwaInstallBanner';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { getToken } from '@/lib/session';
import {
  getContactExtendedMode as loadContactExtendedMode,
  setContactExtendedMode as saveContactExtendedMode,
} from '@/lib/contactAnalysisMode';

const POST_PAYMENT_REGISTER_NUDGE_KEY = 'astrobot_post_payment_register_nudge';
const CHAT_ONBOARDING_STORAGE_KEY = 'astrobot_chat_onboarding_v1';

const HAPTIC_COOLDOWN_MS = 140;
const MAX_CHAT_MESSAGE_CHARS = 8000;
const CHAR_COUNTER_THRESHOLD = 3000;

/**
 * Тактильный отклик при отправке: работает только там, где браузер реализует Vibration API
 * (чаще всего Chrome на Android). На iPhone любые браузеры (включая Яндекс) идут через WebKit —
 * для обычного сайта вибромотор недоступен, это ограничение iOS, а не приложения.
 */
function trySendHaptic(lastAtRef: React.MutableRefObject<number>) {
  try {
    const now = Date.now();
    if (now - lastAtRef.current < HAPTIC_COOLDOWN_MS) return;
    lastAtRef.current = now;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      // Два коротких импульса заметнее, чем один на 12 мс.
      navigator.vibrate([22, 45, 28]);
    }
  } catch {
    /* ignore */
  }
}

type QuickPrompt = {
  label: string;
  prompt: string;
};

type Gender = 'male' | 'female' | 'unknown';

function resolveGender(raw?: string | null): Gender {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'unknown';
  if (/(female|woman|girl|жен|дев|f)/.test(v)) return 'female';
  if (/(male|man|boy|муж|пар|m)/.test(v)) return 'male';
  return 'unknown';
}

function pronounsByGender(gender: Gender): {
  subject: 'он' | 'она';
  object: 'его' | 'её';
  possessiveCap: 'Его' | 'Её';
} {
  if (gender === 'female') {
    return { subject: 'она', object: 'её', possessiveCap: 'Её' };
  }
  return { subject: 'он', object: 'его', possessiveCap: 'Его' };
}

function selfPrompts(): QuickPrompt[] {
  return [
    { label: 'Обо мне', prompt: 'Что звёзды могут сказать обо мне?' },
    { label: 'Мой период', prompt: 'Какой период я сейчас переживаю?' },
    { label: 'Моя удача', prompt: 'Часть моей удачи - на что мне обратить внимание?' },
    { label: 'Моя карьера', prompt: 'Куда мне двигаться в карьере?' },
    { label: 'Мои деньги', prompt: 'Что у меня с финансовым потенциалом на этот период?' },
  ];
}

function partnerPrompts(gender: Gender): QuickPrompt[] {
  const p = pronounsByGender(gender);
  return [
    { label: 'Совместимость', prompt: 'Расскажи о нашей совместимости' },
    { label: `Как ${p.subject} сейчас`, prompt: 'Что сейчас происходит в его/ее жизни?' },
    { label: 'Наше будущее', prompt: 'Дай прогноз по нам на ближайшее будущее.' },
    { label: 'Наши проблемы', prompt: 'Что мешает нам в отношениях?' },
    { label: '5 лет вперёд', prompt: 'Дай прогноз по нам на ближайшие 5 лет.' },
  ];
}

function bossPrompts(gender: Gender): QuickPrompt[] {
  const p = pronounsByGender(gender);
  return [
    { label: 'Как общаться', prompt: 'Как лучше выстроить коммуникацию с начальником?' },
    { label: 'Моё повышение', prompt: 'Могу ли я рассчитывать на повышение?' },
    { label: 'Риск увольнения', prompt: 'Есть ли риск увольнения в ближайшее время?' },
    { label: `Что ${p.subject} думает`, prompt: 'Что он/она думает обо мне в рабочем контексте?' },
    { label: 'Рост дохода', prompt: 'Что поможет мне вырастить доход в работе?' },
  ];
}

function childPrompts(gender: Gender): QuickPrompt[] {
  const p = pronounsByGender(gender);
  return [
    { label: `Лучше узнать ${p.object}`, prompt: 'Помоги мне лучше понять моего ребенка' },
    { label: `${p.possessiveCap} таланты`, prompt: 'В чём природный талант моего ребёнка?' },
    { label: `${p.possessiveCap} здоровье`, prompt: 'Что у ребенка по здоровью?' },
    { label: 'Наше общение', prompt: 'Что я могу улучшить в нашем общении?' },
    { label: `Как ${p.subject} сейчас`, prompt: 'Что сейчас происходит у ребёнка?' },
  ];
}

function detectContactKind(relationRaw: string): 'husband' | 'child' | 'boss' | 'other' {
  const relation = relationRaw.toLowerCase();
  if (/(муж|супруг|партнер|партнёр|парень|любим|жена|супруга|девушк|партнерш)/.test(relation)) return 'husband';
  if (/(ребен|ребён|сын|дочь|дочка|малыш)/.test(relation)) return 'child';
  if (/(началь|руковод|босс|директор|шеф)/.test(relation)) return 'boss';
  return 'other';
}

function detectGenderByRelation(relationRaw: string): Gender {
  const relation = relationRaw.toLowerCase();
  if (/(муж|супруг|партнер|партнёр|парень|любим|начальник|руководитель|босс|директор|шеф|сын|мальчик)/.test(relation)) return 'male';
  if (/(жена|супруга|девушка|любимая|начальница|руководительница|директриса|шефиня|дочь|дочка|девочк)/.test(relation)) return 'female';
  return 'unknown';
}

function isErrorMessage(content: string): boolean {
  const c = content.trimStart();
  return (
    c.startsWith('Сейчас не получилось ответить:') ||
    c.startsWith('Ответ оборвался и может быть неполным:') ||
    c.includes('похоже, соединение прервалось') ||
    c.includes('отправка прервалась') ||
    c.includes('сервис сейчас отвечает медленнее обычного') ||
    c.startsWith('Сервер временно недоступен') ||
    c.includes('Секунду собираю инфу по крупицам звездной пыли') ||
    c.includes('Звезды не всегда бывают покладистыми') ||
    c.includes('достучаться до небес') ||
    c.includes('споткнулся, пока шел')
  );
}

function topWithinScrollParent(el: HTMLElement, scrollParent: HTMLElement): number {
  const pr = scrollParent.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  return er.top - pr.top + scrollParent.scrollTop;
}

/** После отправки: целиком последнее сообщение пользователя + начало ответа ассистента; не вызывать на каждый чанк стрима. */
function alignScrollAfterUserSend(
  container: HTMLElement,
  userEl: HTMLElement,
  assistantEl: HTMLElement,
) {
  const margin = 10;
  const assistantPeek = 80;

  const uTop = topWithinScrollParent(userEl, container);
  const uBottom = uTop + userEl.offsetHeight;
  const aTop = topWithinScrollParent(assistantEl, container);
  const ch = container.clientHeight;
  const maxScroll = Math.max(0, container.scrollHeight - ch);

  let scrollTop = uBottom - ch + assistantPeek;
  scrollTop = Math.max(scrollTop, uBottom - ch + margin);
  scrollTop = Math.min(scrollTop, uTop - margin);
  scrollTop = Math.max(0, Math.min(maxScroll, scrollTop));

  const bottom = scrollTop + ch;
  if (aTop + 8 > bottom) {
    scrollTop = Math.min(maxScroll, aTop - ch + margin + assistantPeek);
    scrollTop = Math.max(0, scrollTop);
  }

  container.scrollTop = scrollTop;
}


export default function Chat() {
  const reduceMotion = useReducedMotion();
  const webVibrateAvailable = useMemo(
    () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
    [],
  );
  const [match, params] = useRoute('/chat/:id?');
  const [, setLocation] = useLocation();
  const { isLoggedIn, openAuthModal, logout } = useAuth();
  const { step: tutorialStep, isActive: tutorialActive, start: startTutorial } = useTutorial();
  const [showPostPaymentRegisterNudge, setShowPostPaymentRegisterNudge] = useState(false);
  const conversationId = match && params?.id ? parseInt(params.id, 10) : undefined;
  const queryClient = useQueryClient();

  const { data: conversation, isLoading } = useGetOpenaiConversation(
    conversationId || 0,
    {
      request: { headers: getAuthHeaders() },
      query: {
        queryKey: getGetOpenaiConversationQueryKey(conversationId || 0),
        enabled: !!conversationId,
      }
    }
  );

  const {
    localMessages,
    isStreaming,
    streamingConversationId,
    sendMessage,
    removeLocalMessages,
    paywallState,
    closePaywall,
    failureCount,
  } = useChatStream();
  const [inputValue, setInputValue] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  /** Расширенный разбор по контакту: каждое сообщение = 2× запроса (см. сервер). */
  const [contactExtendedMode, setContactExtendedMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [contextSwitchTargetId, setContextSwitchTargetId] = useState<number | null | undefined>(undefined);
  const [contactsCount, setContactsCount] = useState<number | null>(null);
  const [onboardingPhase, setOnboardingPhase] = useState<ChatOnboardingPhase | null>(null);
  const [contactRelationById, setContactRelationById] = useState<Record<number, string>>({});
  const [contactNameById, setContactNameById] = useState<Record<number, string>>({});
  const [contactGenderById, setContactGenderById] = useState<Record<number, Gender>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollAfterSendRef = useRef(false);
  const initialOpenScrolledConversationRef = useRef<number | null>(null);
  /** Если пользователь вручную скроллит/касается во время ответа — автоследование отключаем. */
  const autoScrollEnabledRef = useRef(true);
  const [revealScrollTick, setRevealScrollTick] = useState(0);
  const onStreamingRevealProgress = useCallback(() => {
    setRevealScrollTick((t) => t + 1);
  }, []);

  const lastSendHapticAtRef = useRef(0);
  const pwaInstallRef = useRef<PwaInstallBannerHandle>(null);

  const resizeComposer = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, 52), 140);
    el.style.height = `${next}px`;
  };

  // Swipe-from-left-edge detection
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (touchStartX.current < 40 && dx > 60 && dy < 80) {
      setShowHistory(true);
    }
  };

  // Чтобы “следование за ботом” не мешало читать: если пользователь трогает область сообщений — выключаем.
  const stopAutoScroll = () => {
    if (!isStreamVisibleHere) return;
    autoScrollEnabledRef.current = false;
  };

  const isLikelySameMessage = (
    persisted: { role: string; content: string; createdAt?: string | Date },
    local: { role: string; content: string; createdAt?: string | Date },
  ) => {
    if (persisted.role !== local.role) return false;
    if (persisted.content !== local.content) return false;

    const pTime = persisted.createdAt ? new Date(persisted.createdAt).getTime() : NaN;
    const lTime = local.createdAt ? new Date(local.createdAt).getTime() : NaN;
    if (!Number.isFinite(pTime) || !Number.isFinite(lTime)) return false;

    // Optimistic local copy and persisted DB copy should be close in time.
    return Math.abs(pTime - lTime) < 120_000;
  };

  // Memoised so the O(n×m) filter + array allocation doesn't run on every
  // ~30ms re-render during streaming. Re-runs only when persisted messages
  // or localMessages actually change.
  const isStreamVisibleHere =
    isStreaming &&
    streamingConversationId != null &&
    conversationId === streamingConversationId;

  const localMessagesForView = useMemo(() => {
    if (conversationId != null) {
      return localMessages.filter((m) => m.conversationId === conversationId);
    }
    return localMessages.filter((m) => m.conversationId === 0);
  }, [localMessages, conversationId]);

  const displayMessages = useMemo(() => {
    const persisted = conversation?.messages ?? [];
    if (localMessagesForView.length === 0) return persisted;
    if (persisted.length === 0) return localMessagesForView;
    const pendingLocal = localMessagesForView.filter(
      (lm) => !persisted.some((pm) => isLikelySameMessage(pm, lm)),
    );
    return [...persisted, ...pendingLocal];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.messages, localMessagesForView]);

  // Do not clear local stream state on navigation — fetch continues; filter by conversationId above.

  const lastSyncedConversationId = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!conversationId) {
      lastSyncedConversationId.current = undefined;
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !conversation) return;
    if (lastSyncedConversationId.current === conversationId) return;
    lastSyncedConversationId.current = conversationId;
    if (conversation.contactId != null && conversation.contactId > 0) {
      setSelectedContactId(conversation.contactId);
    } else {
      setSelectedContactId(null);
    }
    setContactExtendedMode(Boolean(conversation.contactExtendedMode));
    if (conversation.contactId != null && conversation.contactId > 0) {
      saveContactExtendedMode(conversation.contactId, Boolean(conversation.contactExtendedMode));
    }
  }, [conversationId, conversation]);

  const persistContactExtendedMode = useCallback(
    async (next: boolean) => {
      setContactExtendedMode(next);
      if (selectedContactId != null) {
        saveContactExtendedMode(selectedContactId, next);
      }
      if (conversationId) {
        try {
          await fetch(`/api/openai/conversations/${conversationId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              title: conversation?.title?.trim() || 'Чат',
              contactExtendedMode: next,
            }),
          });
          await queryClient.invalidateQueries({
            queryKey: getGetOpenaiConversationQueryKey(conversationId),
          });
          await queryClient.invalidateQueries({
            queryKey: getListOpenaiConversationsQueryKey(),
          });
        } catch {
          /* ignore */
        }
      }
    },
    [selectedContactId, conversationId, conversation?.title, queryClient],
  );

  useEffect(() => {
    if (selectedContactId === null) {
      setContactExtendedMode(false);
    }
  }, [selectedContactId]);

  useEffect(() => {
    if (conversationId) {
      setOnboardingPhase(null);
    }
  }, [conversationId]);


  const finishChatOnboarding = useCallback(() => {
    try {
      localStorage.setItem(CHAT_ONBOARDING_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOnboardingPhase(null);
  }, []);

  const handleOnboardingNext = useCallback(() => {
    try {
      localStorage.setItem(CHAT_ONBOARDING_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setOnboardingPhase(null);
  }, []);

  useEffect(() => {
    if (conversationId) return;
    if (contactsCount === null) return;
    try {
      if (localStorage.getItem(CHAT_ONBOARDING_STORAGE_KEY) === '1') return;
    } catch {
      return;
    }
    // New tutorial covers this content — skip old overlay until tutorial is done
    if (!isTutorialDone()) return;
    if (isLoggedIn && contactsCount > 0) return;
    if (onboardingPhase !== null) return;

    const t = window.setTimeout(() => setOnboardingPhase('step2'), 450);
    return () => window.clearTimeout(t);
  }, [conversationId, contactsCount, isLoggedIn, onboardingPhase]);

  useEffect(() => {
    const loadContacts = async () => {
      try {
        const res = await fetch('/api/contacts', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const rows = (await res.json()) as Array<{
          id: number;
          name: string;
          relation?: string | null;
          gender?: string | null;
          sex?: string | null;
        }>;
        const next: Record<number, string> = {};
        const nextNames: Record<number, string> = {};
        const nextGender: Record<number, Gender> = {};
        for (const row of rows) {
          next[row.id] = row.relation || '';
          nextNames[row.id] = row.name || '';
          nextGender[row.id] = resolveGender(row.gender ?? row.sex ?? null);
        }
        setContactRelationById(next);
        setContactNameById(nextNames);
        setContactGenderById(nextGender);
      } catch {
        /* ignore */
      }
    };
    void loadContacts();
  }, []);

  useEffect(() => {
    resizeComposer();
  }, [inputValue]);

  useLayoutEffect(() => {
    if (!pendingScrollAfterSendRef.current) return;
    // Если пользователь уже отключил автоследование — не принудительно скроллим.
    if (!autoScrollEnabledRef.current) {
      pendingScrollAfterSendRef.current = false;
      return;
    }
    const container = messagesScrollRef.current;
    if (!container) {
      pendingScrollAfterSendRef.current = false;
      return;
    }
    const rows = container.querySelectorAll('[data-chat-row]');
    if (rows.length < 2) {
      pendingScrollAfterSendRef.current = false;
      return;
    }
    const last = rows[rows.length - 1] as HTMLElement;
    const prev = rows[rows.length - 2] as HTMLElement;
    if (prev.dataset.chatRow !== 'user' || last.dataset.chatRow !== 'assistant') {
      pendingScrollAfterSendRef.current = false;
      return;
    }
    pendingScrollAfterSendRef.current = false;
    alignScrollAfterUserSend(container, prev, last);
  }, [localMessagesForView.length]);

  // Tracks the character length of the streaming assistant message.
  // Changes every ~30 ms batch-commit, so the scroll useLayoutEffect below
  // fires at that cadence — giving smooth continuous scroll instead of
  // ratcheting only at \n\n paragraph boundaries.
  const streamingContentLength = useMemo(() => {
    if (!isStreamVisibleHere) return 0;
    const last = localMessagesForView[localMessagesForView.length - 1];
    if (!last || last.role !== 'assistant') return 0;
    return (last.content || '').length;
  }, [isStreamVisibleHere, localMessagesForView]);

  // Во время стрима: простой scroll до низа при каждом обновлении контента.
  useLayoutEffect(() => {
    if (!isStreamVisibleHere || !autoScrollEnabledRef.current) return;
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [isStreamVisibleHere, streamingContentLength, revealScrollTick]);

  // Если пользователь прокручивает в прошлое — отключаем автоследование; если возвращается к низу — снова включаем.
  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;

    const onScroll = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      autoScrollEnabledRef.current = distanceFromBottom < 80;
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    if (!conversationId || isLoading) return;
    if (initialOpenScrolledConversationRef.current === conversationId) return;
    const container = messagesScrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      initialOpenScrolledConversationRef.current = conversationId;
    });
  }, [conversationId, isLoading, displayMessages.length]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // iPad/Safari: after app resume textarea layout/focus can get stuck.
      requestAnimationFrame(() => {
        resizeComposer();
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(POST_PAYMENT_REGISTER_NUDGE_KEY) === '1' && !isLoggedIn) {
        setShowPostPaymentRegisterNudge(true);
      }
    } catch {
      /* ignore */
    }
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      try {
        sessionStorage.removeItem(POST_PAYMENT_REGISTER_NUDGE_KEY);
      } catch {
        /* ignore */
      }
      setShowPostPaymentRegisterNudge(false);
    }
  }, [isLoggedIn]);

  // Auto-start tutorial for new users (no conversationId = fresh chat screen).
  // Defer while paywall is open; retry after registration or onboarding complete.
  useEffect(() => {
    if (conversationId) return;
    if (isTutorialDone()) return;
    if (tutorialActive) return;
    if (paywallState?.open) return;

    const isFresh = (() => {
      try { return sessionStorage.getItem(FRESH_ONBOARDING_KEY) === '1'; } catch { return false; }
    })();
    const delay = isFresh ? 600 : 1400;
    const t = window.setTimeout(() => {
      if (isTutorialDone()) return;
      startTutorial();
      try { sessionStorage.removeItem(FRESH_ONBOARDING_KEY); } catch { /* ignore */ }
    }, delay);
    return () => window.clearTimeout(t);
  }, [conversationId, paywallState?.open, isLoggedIn, tutorialActive, startTutorial]);

  // Open / close profile sheet at the right tutorial steps
  useEffect(() => {
    if (!tutorialActive) return;
    if (tutorialStep === 8 && !showProfile) setShowProfile(true);
    if (tutorialStep === 10 && showProfile) setShowProfile(false);
  // showProfile intentionally excluded to avoid re-triggering
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialStep, tutorialActive]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'success') return;
    params.delete('payment');
    const qs = params.toString();
    const path = window.location.pathname;
    window.history.replaceState({}, '', qs ? `${path}?${qs}` : path);

    const onPaymentSuccess = async () => {
      let applied = 0;
      let reconcileFailed = false;
      try {
        const res = await fetch('/api/billing/payments/reconcile', {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const payload = (await res.json()) as { applied?: number };
          applied = typeof payload.applied === 'number' ? payload.applied : 0;
        } else {
          reconcileFailed = true;
        }
      } catch {
        reconcileFailed = true;
      }

      const loggedIn = Boolean(getToken());
      toast({
        title: loggedIn ? 'Спасибо!' : 'Спасибо, всё прошло хорошо',
        description: applied > 0
          ? `Пакет зачислен: +${applied} запросов.`
          : loggedIn
            ? reconcileFailed
              ? 'Оплата подтверждена, но баланс обновить не удалось. Попробуйте обновить страницу.'
              : 'Оплата подтверждена. Баланс обновится автоматически.'
            : 'Запросы привязаны к этому устройству. Если захотите, зарегистрируйтесь здесь же и они сохранятся за аккаунтом.',
      });

      if (!loggedIn) {
        try {
          sessionStorage.setItem(POST_PAYMENT_REGISTER_NUDGE_KEY, '1');
        } catch {
          /* ignore */
        }
        setShowPostPaymentRegisterNudge(true);
      }
    };

    void onPaymentSuccess();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onboardingBlocked') !== '1') return;

    params.delete('onboardingBlocked');
    const qs = params.toString();
    const path = window.location.pathname;
    window.history.replaceState({}, '', qs ? `${path}?${qs}` : path);

    let dismissNotice: (() => void) | undefined;
    const notice = toast({
      title: 'Этот аккаунт уже настроен',
      description: (
        <div className="mt-1 space-y-2">
          <p>Для создания нового профиля необходимо выйти из текущего аккаунта.</p>
          <button
            type="button"
            onClick={() => {
              logout();
              dismissNotice?.();
            }}
            className="inline-flex h-8 items-center justify-center rounded-md border-0 px-3 text-sm font-semibold bg-gradient-to-r from-[#c9a227] via-[#e8d18c] to-[#f4e4a8] text-[#1a1508] hover:brightness-105"
          >
            Выйти
          </button>
        </div>
      ),
    });
    dismissNotice = notice.dismiss;
  }, [logout]);

  const dismissPostPaymentNudge = () => {
    try {
      sessionStorage.removeItem(POST_PAYMENT_REGISTER_NUDGE_KEY);
    } catch {
      /* ignore */
    }
    setShowPostPaymentRegisterNudge(false);
  };

  const handleRetry = async (errorMsgId: number, userContent: string, userMsgId?: number) => {
    if (isStreaming) return;
    const toRemove = [errorMsgId];
    if (userMsgId != null) toRemove.push(userMsgId);
    removeLocalMessages(toRemove);
    pendingScrollAfterSendRef.current = true;
    autoScrollEnabledRef.current = true;
    trySendHaptic(lastSendHapticAtRef);
    try {
      const newConvId = await sendMessage(userContent, selectedContactId, contactExtendedMode, conversationId);
      if (!conversationId && newConvId) {
        setLocation(`/chat/${newConvId}`, { replace: true });
      }
    } catch {
      pendingScrollAfterSendRef.current = false;
    }
  };

  const handleUrgentSupport = async () => {
    try {
      await fetch('/api/support/urgent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ sessionId: getSessionId(), conversationId, failureCount }),
      });
    } catch {
      /* best-effort */
    }
    toast({
      title: 'Запрос отправлен',
      description: 'Мы получили сигнал и скоро разберёмся. Спасибо за терпение ❤️',
      duration: 4000,
    });
  };

  const inputTooLong = inputValue.length > MAX_CHAT_MESSAGE_CHARS;

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isStreaming || inputTooLong) return;
    trySendHaptic(lastSendHapticAtRef);
    const text = inputValue.trim();
    setInputValue('');
    requestAnimationFrame(() => resizeComposer());
    pendingScrollAfterSendRef.current = true;
    // При новом сообщении включаем автоследование заново.
    autoScrollEnabledRef.current = true;
    try {
      const newConvId = await sendMessage(text, selectedContactId, contactExtendedMode, conversationId);
      if (!conversationId && newConvId) {
        setLocation(`/chat/${newConvId}`, { replace: true });
      }
      if (newConvId) pwaInstallRef.current?.check();
    } catch {
      pendingScrollAfterSendRef.current = false;
    }
  };

  const copyMessage = async (content: string) => {
    const text = `${content}\n\nСообщение от вашего персонального АстроБота — https://astroai.site`;
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Скопировано',
        description: 'Текст добавлен в буфер обмена.',
        duration: 1800,
      });
    } catch {
      toast({
        title: 'Не вышло скопировать',
        description: 'Разрешите доступ к буферу обмена в браузере или скопируйте текст вручную.',
      });
    }
  };

  const requestContextSwitch = (nextId: number | null) => {
    if (nextId === selectedContactId) return;
    if (!conversationId || displayMessages.length === 0) {
      setSelectedContactId(nextId);
      if (nextId != null) {
        setContactExtendedMode(loadContactExtendedMode(nextId));
      }
      return;
    }
    setShowHistory(false);
    setShowProfile(false);
    setContextSwitchTargetId(nextId);
  };

  const applyContextSwitch = (mode: 'continue' | 'new') => {
    const nextId = contextSwitchTargetId;
    setContextSwitchTargetId(undefined);
    if (typeof nextId === 'undefined') return;
    if (mode === 'new' && conversationId) {
      setSelectedContactId(nextId);
      if (nextId != null) {
        setContactExtendedMode(loadContactExtendedMode(nextId));
      } else {
        setContactExtendedMode(false);
      }
      setLocation('/chat');
      return;
    }
    setSelectedContactId(nextId);
    if (nextId != null) {
      setContactExtendedMode(loadContactExtendedMode(nextId));
    }
  };

  // IDs of messages added during this session (not loaded from DB) — they get a fade-in entry
  const localMsgIdSet = useMemo(() => new Set(localMessages.map((m) => m.id)), [localMessages]);
  const streamingLocalMessageId = isStreamVisibleHere
    ? localMessagesForView[localMessagesForView.length - 1]?.id
    : undefined;

  const isNew = !conversationId && displayMessages.length === 0;
  const showContactModePicker =
    selectedContactId != null && displayMessages.length === 0 && !isLoading;
  const showContactChatHeader =
    selectedContactId != null && displayMessages.length > 0;
  const selectedContactName =
    selectedContactId != null ? contactNameById[selectedContactId] || 'Контакт' : '';
  const selectedRelation = selectedContactId != null ? (contactRelationById[selectedContactId] || '') : '';
  const selectedKind = detectContactKind(selectedRelation);
  const selectedProfileGender = selectedContactId != null ? (contactGenderById[selectedContactId] || 'unknown') : 'unknown';
  const contactGender: Gender = selectedProfileGender !== 'unknown'
    ? selectedProfileGender
    : detectGenderByRelation(selectedRelation);
  const contactPromptSet: QuickPrompt[] = selectedKind === 'husband'
    ? partnerPrompts(contactGender)
    : selectedKind === 'boss'
      ? bossPrompts(contactGender)
      : selectedKind === 'child'
        ? childPrompts(contactGender)
        : [
          { label: 'Совместимость', prompt: 'Расскажи о нашей совместимости' },
          { label: 'Таланты', prompt: 'Какие у этого человека сильные аспекты?' },
          { label: 'Здоровье', prompt: 'Что у этого человека по здоровью?' },
          { label: 'Что сейчас', prompt: 'Какой период сейчас у этого человека?' },
          { label: 'Общение', prompt: 'Как лучше выстроить контакт с этим человеком?' },
        ];

  const promptSubtitle = selectedContactId == null
    ? (!isLoggedIn ? '5 бесплатных запросов - пробуйте и оцените формат.' : '')
    : '';

  return (
    <>
      <AppLayout>
        <div
          className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Header */}
          <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5 px-3 py-1.5 flex items-center gap-2 shadow-sm min-h-[44px]">
            {showContactChatHeader ? (
              <>
                {conversationId ? (
                  <button
                    type="button"
                    onClick={() => setLocation('/chat')}
                    className="p-1.5 -ml-1 rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition shrink-0"
                    aria-label="Назад"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="w-8 shrink-0" />
                )}
                <div className="flex-1 min-w-0 flex items-center justify-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {selectedContactName.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium truncate">
                    {selectedContactName}
                    {selectedRelation ? (
                      <span className="text-muted-foreground"> · {selectedRelation}</span>
                    ) : null}
                  </p>
                </div>
                <ContactHeaderModeSwitch
                  extended={contactExtendedMode}
                  onChange={(next) => void persistContactExtendedMode(next)}
                  disabled={isStreaming}
                />
              </>
            ) : (
              <>
                {conversationId ? (
                  <button
                    onClick={() => setLocation('/chat')}
                    className="p-1.5 -ml-1 rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="w-8" />
                )}

                <div className="flex-1 flex items-center justify-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent p-[1px]">
                    <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden relative">
                      <Sparkles className="w-3.5 h-3.5 text-primary/70 absolute" />
                      <img
                        src={`${import.meta.env.BASE_URL}images/avatar-bot.png`}
                        alt="AstroBot"
                        className="w-full h-full rounded-full object-cover relative z-10"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  </div>
                  <h2 className="font-display font-semibold text-sm">AstroBot</h2>
                </div>

                <div className="w-10 shrink-0" />
              </>
            )}
          </header>

          {/* People Panel */}
          <PeoplePanel
            selectedContactId={selectedContactId}
            onSelect={requestContextSwitch}
            onContactsLoaded={setContactsCount}
            onboardingHighlightAdd={onboardingPhase === 'step2'}
          />

          {/* Messages */}
          <div
            ref={messagesScrollRef}
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-3 space-y-4 [overflow-anchor:none]"
            onTouchStart={stopAutoScroll}
            onPointerDown={stopAutoScroll}
          >
            {isLoading && (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {showContactModePicker && (
              <div className="flex flex-col items-center py-2">
                <ContactAnalysisModeScreen
                  extended={contactExtendedMode}
                  onChange={(next) => void persistContactExtendedMode(next)}
                />
                <div data-tutorial-id="quick-topics" className="flex flex-wrap justify-center gap-2 w-full max-w-md mt-4 px-1">
                  {contactPromptSet.map((prompt, i) => (
                    <motion.button
                      key={i}
                      type="button"
                      onClick={() => setInputValue(prompt.prompt)}
                      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      className="w-auto px-4 py-2.5 rounded-2xl text-sm bg-card/70 border border-white/10 hover:border-primary/50 hover:bg-white/5 transition-colors text-center leading-snug"
                    >
                      {prompt.label}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {isNew && !isLoading && selectedContactId == null && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-2 text-center"
              >
                {/* Daily Forecast Card */}
                {!selectedContactId && (
                  <div className="w-full max-w-md mb-3" data-tutorial-id="forecast-card">
                    <DailyForecastCard onAskQuestion={(q) => { setInputValue(q); }} />
                  </div>
                )}

                <div className="w-12 h-12 rounded-full bg-secondary/50 border border-primary/20 flex items-center justify-center mb-2.5 shadow-[0_0_20px_rgba(212,175,55,0.14)]">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-base font-display font-semibold mb-1">С чего начнем?</h3>
                {promptSubtitle ? (
                  <p
                    data-tutorial-id="free-requests"
                    className="mb-3 max-w-md text-sm text-primary/85 leading-relaxed"
                  >
                    {promptSubtitle}
                  </p>
                ) : (
                  <p
                    data-tutorial-id="free-requests"
                    aria-hidden="true"
                    className="sr-only"
                  >
                    5 бесплатных запросов - пробуйте и оцените формат.
                  </p>
                )}
                <div data-tutorial-id="quick-topics" className="flex flex-wrap justify-center gap-2 w-full max-w-md">
                  {(selectedContactId
                    ? contactPromptSet
                    : selfPrompts()
                  ).map((prompt, i) => (
                    <motion.button
                      key={i}
                      type="button"
                      onClick={() => setInputValue(prompt.prompt)}
                      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                      whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                      className="w-auto min-h-10 px-5 py-2 rounded-full text-sm bg-card/70 border border-white/10 hover:border-primary/50 hover:bg-white/5 transition-colors text-center leading-none whitespace-nowrap"
                    >
                      {prompt.label}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {displayMessages.map((msg, idx) => {
              const isErrMsg = msg.role === 'assistant' && !!msg.content?.trim() && isErrorMessage(msg.content);
              const precedingUserMsg = isErrMsg
                ? displayMessages.slice(0, idx).reverse().find(m => m.role === 'user') ?? null
                : null;
              const isStreamingMsg =
                isStreamVisibleHere &&
                msg.role === 'assistant' &&
                msg.id === streamingLocalMessageId &&
                localMsgIdSet.has(msg.id) &&
                idx === displayMessages.length - 1;
              return (
              <motion.div
                key={msg.id || idx}
                data-chat-row={msg.role}
                initial={localMsgIdSet.has(msg.id) ? { opacity: 0, y: msg.role === 'user' ? 10 : 5 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/25 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden relative">
                    <Sparkles className="w-4 h-4 text-primary/60 absolute" />
                    <img
                      src={`${import.meta.env.BASE_URL}images/avatar-bot.png`}
                      alt="Bot"
                      className="w-full h-full object-cover relative z-10"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className={msg.role === 'user' ? 'max-w-[82%] min-w-0 flex flex-col' : 'flex-1 min-w-0 flex flex-col'}>
                  <div
                    className={`min-w-0 ${
                      msg.role === 'user'
                        ? 'rounded-2xl p-4 bg-[rgba(201,162,39,0.12)] border border-[rgba(201,162,39,0.2)] text-foreground rounded-tr-sm break-words overflow-x-hidden'
                        : 'rounded-2xl p-5 bg-white/[0.04] border border-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.15)] break-words overflow-x-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto streaming-message-content'
                    }`}
                    style={{ fontSize: '16px', lineHeight: 1.65, fontWeight: 400 }}
                  >
                    {msg.role !== 'user' ? (
                      msg.content?.trim() ? (
                        <AstroMarkdown
                          content={msg.content}
                          isStreaming={isStreamingMsg}
                          onRevealProgress={
                            isStreamingMsg ? onStreamingRevealProgress : undefined
                          }
                        />
                      ) : (
                        <div className="flex space-x-1 py-1 not-prose">
                          <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                          <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                          <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                        </div>
                      )
                    ) : msg.content}
                  </div>
                  {msg.content?.trim() && !isStreamingMsg && (
                    <div className={`mt-1.5 flex gap-1.5 ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                      <button
                        type="button"
                        onClick={() => copyMessage(String(msg.content))}
                        className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 hover:border-primary/40 hover:text-primary transition"
                      >
                        <Copy className="w-3 h-3" />
                        Скопировать
                      </button>
                      {isErrMsg && precedingUserMsg && (
                        <button
                          type="button"
                          onClick={() => handleRetry(msg.id, String(precedingUserMsg.content), precedingUserMsg.id)}
                          disabled={isStreaming}
                          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 transition disabled:opacity-50"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Повторить
                        </button>
                      )}
                      {isErrMsg && failureCount >= 3 && (
                        <button
                          type="button"
                          onClick={handleUrgentSupport}
                          className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 transition"
                        >
                          🚨 В поддержку
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
              );
            })}

            {showPostPaymentRegisterNudge && !isLoggedIn && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/25 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden relative">
                  <Sparkles className="w-4 h-4 text-primary/60 absolute" />
                  <img
                    src={`${import.meta.env.BASE_URL}images/avatar-bot.png`}
                    alt="Bot"
                    className="w-full h-full object-cover relative z-10"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 min-w-0 prose prose-invert prose-p:leading-relaxed prose-sm max-w-none py-1">
                  <p className="text-sm leading-relaxed">
                    Хотел сказать: если ты пройдешь регистрацию, я смогу помнить твои чаты даже при входе с другого устройства.
                    Сейчас память и пакеты запросов привязаны только к этому браузеру и этому устройству.
                    Если захочешь - можно зарегистрироваться сейчас или через меню (кнопка-бургер) внизу профиля.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={dismissPostPaymentNudge}
                      className="px-3 py-2 rounded-full text-xs bg-white/5 border border-border hover:bg-white/10 transition"
                    >
                      Продолжить чат
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dismissPostPaymentNudge();
                        openAuthModal('register');
                      }}
                      className="px-3 py-2 rounded-full text-xs bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition"
                    >
                      Зарегистрироваться
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="h-4 shrink-0" aria-hidden />
          </div>

          {/* Unified bottom panel: input + nav tabs */}
          <div className="shrink-0 bg-background/80 backdrop-blur-xl border-t border-border">
          <div className="px-4 pt-2 pb-2">
            {inputValue.length > CHAR_COUNTER_THRESHOLD && (
              <div className={`text-right text-xs mb-1 tabular-nums ${inputValue.length > MAX_CHAT_MESSAGE_CHARS ? 'text-destructive font-medium' : inputValue.length > MAX_CHAT_MESSAGE_CHARS * 0.9 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                {inputValue.length}/{MAX_CHAT_MESSAGE_CHARS}
              </div>
            )}
            <form data-tutorial-id="chat-input" onSubmit={handleSend} className="relative flex items-end">
              <textarea
                ref={inputRef}
                value={inputValue}
                onPointerDown={() => {
                  if (isStreaming) return;
                  // iPad/Safari: explicit focus nudge after resume.
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  resizeComposer();
                }}
                onInput={resizeComposer}
                placeholder={
                  selectedContactId
                    ? contactExtendedMode
                      ? 'Прогноз, этапы отношений, сценарий...'
                      : 'Что с ним сейчас, что между вами...'
                    : 'Спросите звёзды...'
                }
                rows={1}
                className="w-full min-h-[52px] max-h-[140px] resize-none overflow-y-auto bg-card border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded-3xl py-3 pl-4 pr-14 text-foreground placeholder:text-muted-foreground outline-none transition-all shadow-inner shadow-black/50 leading-relaxed"
                disabled={isStreaming}
              />
              <motion.button
                type="submit"
                disabled={!inputValue.trim() || isStreaming || inputTooLong}
                onPointerDown={() => {
                  if (isStreaming || !inputValue.trim() || inputTooLong) return;
                  trySendHaptic(lastSendHapticAtRef);
                }}
                whileTap={
                  reduceMotion
                    ? undefined
                    : { scale: webVibrateAvailable ? 0.9 : 0.82 }
                }
                whileHover={reduceMotion ? undefined : { scale: webVibrateAvailable ? 1.06 : 1.04 }}
                transition={{ type: 'spring', stiffness: webVibrateAvailable ? 480 : 560, damping: webVibrateAvailable ? 22 : 26 }}
                className="absolute right-2 bottom-2 p-2 bg-primary text-primary-foreground rounded-full ring-offset-2 ring-offset-background hover:bg-primary/90 active:ring-2 active:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-[box-shadow] duration-150"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </motion.button>
            </form>
          </div>
          {/* Nav tabs — part of the unified bottom panel */}
          <div data-bottom-nav className="flex pb-safe">
            <button
              type="button"
              onClick={() => { if (showProfile) setShowProfile(false); setShowHistory((v) => !v); }}
              data-tutorial-id="nav-chats"
              aria-label="Чаты"
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[44px] transition-colors touch-manipulation ${showHistory ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 leading-none">Чаты</span>
            </button>
            <button
              type="button"
              onClick={() => { if (showHistory) setShowHistory(false); setShowProfile((v) => !v); }}
              data-tutorial-id="nav-profile"
              aria-label="Профиль"
              className={`flex-1 flex flex-col items-center justify-center py-2 min-h-[44px] transition-colors touch-manipulation ${showProfile ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <User className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 leading-none">Профиль</span>
            </button>
          </div>
          </div>
        </div>
      </AppLayout>

      <ProfileSheet
        variant="sheet"
        open={showProfile}
        onClose={() => setShowProfile(false)}
      />

      <HistoryDrawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        onLoginClick={() => setShowAuthModal(true)}
      />

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialTab="login"
      />

      <PaywallSheet
        open={Boolean(paywallState?.open)}
        onClose={closePaywall}
        reason={paywallState?.message}
      />

      {onboardingPhase ? (
        <ChatOnboardingOverlay
          phase={onboardingPhase}
          onNext={handleOnboardingNext}
          onSkip={finishChatOnboarding}
          reduceMotion={reduceMotion}
        />
      ) : null}

      <PwaInstallBanner handle={pwaInstallRef} />

      {typeof contextSwitchTargetId !== 'undefined' && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
            onClick={() => setContextSwitchTargetId(undefined)}
          />
          <div className="fixed left-3 right-3 z-[201] rounded-2xl border border-border bg-card p-4 shadow-2xl" style={{ bottom: 'calc(7rem + env(safe-area-inset-bottom, 0px) + 0.5rem)' }}>
            <p className="text-sm font-medium mb-2">Продолжаем этот же диалог в контексте карты другого человека, или начинаем новый чат?</p>
            <p className="text-xs text-muted-foreground mb-3">
              Выберите удобный вариант для этого переключения.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => applyContextSwitch('continue')}
                className="flex-1 px-3 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm hover:bg-primary/20 transition"
              >
                Продолжить этот
              </button>
              <button
                type="button"
                onClick={() => applyContextSwitch('new')}
                className="flex-1 px-3 py-2 rounded-xl bg-card border border-border text-sm hover:border-primary/30 transition"
              >
                Новый чат
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
