import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Send, Sparkles, ChevronLeft, Copy, CircleHelp, X, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
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
import { ChatOnboardingOverlay, type ChatOnboardingPhase } from '@/components/chat/ChatOnboardingOverlay';
import HistoryDrawer from '@/components/chat/HistoryDrawer';
import AuthModal from '@/components/AuthModal';
import DailyForecastCard from '@/components/chat/DailyForecastCard';
import PaywallSheet from '@/components/billing/PaywallSheet';
import BottomNav from '@/components/layout/BottomNav';
import ProfileSheet from '@/components/profile/ProfileSheet';
import PwaInstallBanner, { type PwaInstallBannerHandle } from '@/components/pwa/PwaInstallBanner';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { getToken } from '@/lib/session';

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
    { label: '🌙 Обо мне', prompt: 'Что звёзды могут сказать обо мне?' },
    { label: '🌀 Мой период', prompt: 'Какой период я сейчас переживаю?' },
    { label: '🍀 Моя удача', prompt: 'Часть моей удачи - на что мне обратить внимание?' },
    { label: '💼 Моя Карьера', prompt: 'Куда мне двигаться в карьере?' },
    { label: '💰 Мои Деньги', prompt: 'Что у меня с финансовым потенциалом на этот период?' },
  ];
}

function partnerPrompts(gender: Gender): QuickPrompt[] {
  const p = pronounsByGender(gender);
  return [
    { label: '💞 Совместимость', prompt: 'Расскажи о нашей совместимости' },
    { label: `🌀 Как ${p.subject} сейчас?`, prompt: 'Что сейчас происходит в его/ее жизни?' },
    { label: '🔮 Наше будущее', prompt: 'Дай прогноз по нам на ближайшее будущее.' },
    { label: '⚡ Наши проблемы', prompt: 'Что мешает нам в отношениях?' },
    { label: '📅 5 лет вперёд', prompt: 'Дай прогноз по нам на ближайшие 5 лет.' },
  ];
}

function bossPrompts(gender: Gender): QuickPrompt[] {
  const p = pronounsByGender(gender);
  return [
    { label: '🤝 Как общаться?', prompt: 'Как лучше выстроить коммуникацию с начальником?' },
    { label: '📈 Моё повышение', prompt: 'Могу ли я рассчитывать на повышение?' },
    { label: '😬 Увольнение', prompt: 'Есть ли риск увольнения в ближайшее время?' },
    { label: `🌀 Что ${p.subject} думает`, prompt: 'Что он/она думает обо мне в рабочем контексте?' },
    { label: '💰 Рост дохода', prompt: 'Что поможет мне вырастить доход в работе?' },
  ];
}

function childPrompts(gender: Gender): QuickPrompt[] {
  const p = pronounsByGender(gender);
  return [
    { label: `🧩 Лучше узнать ${p.object}`, prompt: 'Помоги мне лучше понять моего ребенка' },
    { label: `🌟 ${p.possessiveCap} таланты`, prompt: 'В чём природный талант моего ребёнка?' },
    { label: `💚 ${p.possessiveCap} здоровье`, prompt: 'Что у ребенка по здоровью?' },
    { label: '🗣️ Наше общение', prompt: 'Что я могу улучшить в нашем общении?' },
    { label: `🌀 Как ${p.subject} сейчас?`, prompt: 'Что сейчас происходит у ребёнка?' },
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
  const [match, params] = useRoute('/chat/:id');
  const [, setLocation] = useLocation();
  const { isLoggedIn, openAuthModal, logout } = useAuth();
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
    sendMessage,
    clearLocalMessages,
    removeLocalMessages,
    paywallState,
    closePaywall,
    streamingText,
    failureCount,
  } = useChatStream(conversationId);
  const [inputValue, setInputValue] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  /** Расширенный разбор по контакту: каждое сообщение = 2× запроса (см. сервер). */
  const [contactExtendedMode, setContactExtendedMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [contextSwitchTargetId, setContextSwitchTargetId] = useState<number | null | undefined>(undefined);
  const [showContactModeHint, setShowContactModeHint] = useState(false);
  const [contactsCount, setContactsCount] = useState<number | null>(null);
  const [onboardingPhase, setOnboardingPhase] = useState<ChatOnboardingPhase | null>(null);
  const [contactRelationById, setContactRelationById] = useState<Record<number, string>>({});
  const [contactGenderById, setContactGenderById] = useState<Record<number, Gender>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollAfterSendRef = useRef(false);
  const initialOpenScrolledConversationRef = useRef<number | null>(null);
  /** Если пользователь вручную скроллит/касается во время ответа — автоследование отключаем. */
  const autoScrollEnabledRef = useRef(true);
  const lastAutoScrollAtRef = useRef(0);
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
    if (!isStreaming) return;
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

  const displayMessages = (() => {
    const persisted = conversation?.messages ?? [];
    if (localMessages.length === 0) return persisted;
    if (persisted.length === 0) return localMessages;

    const pendingLocal = localMessages.filter(
      (lm) => !persisted.some((pm) => isLikelySameMessage(pm, lm)),
    );

    return [...persisted, ...pendingLocal];
  })();

  useEffect(() => {
    clearLocalMessages();
  }, [conversationId]);

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
  }, [conversationId, conversation]);

  useEffect(() => {
    if (selectedContactId === null) {
      setContactExtendedMode(false);
      setShowContactModeHint(false);
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
        const rows = (await res.json()) as Array<{ id: number; relation?: string | null; gender?: string | null; sex?: string | null }>;
        const next: Record<number, string> = {};
        const nextGender: Record<number, Gender> = {};
        for (const row of rows) {
          next[row.id] = row.relation || '';
          nextGender[row.id] = resolveGender(row.gender ?? row.sex ?? null);
        }
        setContactRelationById(next);
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
  }, [localMessages.length]);

  // Во время стрима автоскроллим следом за ботом, пока автоследование не отключено пользователем.
  useLayoutEffect(() => {
    if (!isStreaming) return;
    if (!autoScrollEnabledRef.current) return;
    const container = messagesScrollRef.current;
    if (!container) return;

    const now = Date.now();
    if (now - lastAutoScrollAtRef.current < 50) return; // небольшая защита от дрожания
    lastAutoScrollAtRef.current = now;

    requestAnimationFrame(() => {
      if (!autoScrollEnabledRef.current) return;
      container.scrollTop = container.scrollHeight;
    });
  }, [isStreaming, streamingText]);

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
      const newConvId = await sendMessage(userContent, selectedContactId, contactExtendedMode);
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

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isStreaming) return;
    trySendHaptic(lastSendHapticAtRef);
    const text = inputValue.trim();
    const tooLong = text.length > MAX_CHAT_MESSAGE_CHARS;
    if (!tooLong) setInputValue('');
    requestAnimationFrame(() => resizeComposer());
    pendingScrollAfterSendRef.current = true;
    // При новом сообщении включаем автоследование заново.
    autoScrollEnabledRef.current = true;
    try {
      const newConvId = await sendMessage(text, selectedContactId, contactExtendedMode);
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
      return;
    }
    setContextSwitchTargetId(nextId);
  };

  const applyContextSwitch = (mode: 'continue' | 'new') => {
    const nextId = contextSwitchTargetId;
    setContextSwitchTargetId(undefined);
    if (typeof nextId === 'undefined') return;
    if (mode === 'new' && conversationId) {
      setSelectedContactId(nextId);
      setLocation('/chat');
      return;
    }
    setSelectedContactId(nextId);
  };

  const isNew = !conversationId && displayMessages.length === 0;
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
          { label: '💫 Синастрия', prompt: 'Расскажи о нашей синастрии' },
          { label: '🌟 Таланты', prompt: 'Какие у этого человека сильные аспекты?' },
          { label: '💚 Здоровье', prompt: 'Что у этого человека по здоровью?' },
          { label: '🌀 Что сейчас', prompt: 'Какой период сейчас у этого человека?' },
          { label: '🗣️ Общение', prompt: 'Как лучше выстроить контакт с этим человеком?' },
        ];

  const promptSubtitle = selectedContactId == null
    ? (!isLoggedIn ? '5 бесплатных запросов - пробуйте и оцените формат.' : '')
    : selectedKind === 'child'
      ? 'Базовый разбор: карта ребёнка, его период и синастрия с вами.'
      : selectedKind === 'husband'
        ? 'Базовый разбор: его карта, текущий период и синастрия с вами.'
        : selectedKind === 'boss'
          ? 'Базовый разбор: карта руководителя, его период и синастрия с вами.'
          : 'Базовый разбор: карта человека, его период и синастрия с вами.';

  return (
    <>
      <AppLayout>
        <div
          className="flex-1 flex flex-col min-h-0 min-w-0 overflow-x-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Header */}
          <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5 px-3 py-1.5 flex items-center justify-between shadow-sm">
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

            <div className="flex items-center gap-2">
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

            <div className="w-10" />
          </header>

          {/* People Panel */}
          <PeoplePanel
            selectedContactId={selectedContactId}
            onSelect={requestContextSwitch}
            contactTier={
              selectedContactId != null
                ? contactExtendedMode
                  ? 'extended'
                  : 'base'
                : null
            }
            onContactsLoaded={setContactsCount}
            onboardingHighlightAdd={onboardingPhase === 'step2'}
          />

          {/* Messages */}
          <div
            ref={messagesScrollRef}
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4"
            onTouchStart={stopAutoScroll}
            onPointerDown={stopAutoScroll}
          >
            {isLoading && (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {isNew && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-2 text-center"
              >
                {/* Daily Forecast Card */}
                {!selectedContactId && (
                  <div className="w-full max-w-md mb-3">
                    <DailyForecastCard onAskQuestion={(q) => { setInputValue(q); }} />
                  </div>
                )}

                <div className="w-12 h-12 rounded-full bg-secondary/50 border border-primary/20 flex items-center justify-center mb-2.5 shadow-[0_0_20px_rgba(212,175,55,0.14)]">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-base font-display font-semibold mb-1">С чего начнем?</h3>
                {promptSubtitle && (
                  <p className="mb-3 max-w-md text-sm text-primary/85 leading-relaxed">
                    {promptSubtitle}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-2 w-full max-w-md">
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
                      className="w-auto px-4 py-2.5 rounded-2xl text-sm bg-card/70 border border-white/10 hover:border-primary/50 hover:bg-white/5 transition-colors text-center leading-snug"
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
              return (
              <motion.div
                key={msg.id || idx}
                data-chat-row={msg.role}
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-secondary border border-primary/30 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden relative">
                    <Sparkles className="w-4 h-4 text-primary/50 absolute" />
                    <img
                      src={`${import.meta.env.BASE_URL}images/avatar-bot.png`}
                      alt="Bot"
                      className="w-full h-full object-cover relative z-10"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="max-w-[82%] min-w-0 flex flex-col">
                  <div className={`min-w-0 rounded-2xl p-4 shadow-lg ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 text-foreground rounded-tr-sm break-words overflow-x-hidden'
                      : msg.role === 'assistant'
                        ? 'bg-gradient-to-br from-white/[0.18] to-white/[0.08] border border-white/30 text-foreground rounded-tl-sm shadow-[0_8px_26px_rgba(0,0,0,0.38)] ring-1 ring-white/20 prose prose-invert prose-p:leading-relaxed prose-sm max-w-none break-words overflow-x-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto'
                        : 'bg-gradient-to-br from-white/[0.16] to-white/[0.06] border border-white/25 text-foreground shadow-[0_6px_20px_rgba(0,0,0,0.32)] ring-1 ring-white/15 prose prose-invert prose-p:leading-relaxed prose-sm max-w-none break-words overflow-x-hidden [&_pre]:max-w-full [&_pre]:overflow-x-auto'
                  }`}>
                    {msg.role === 'assistant' ? (
                      msg.content?.trim() ? (
                        <AstroMarkdown content={msg.content} />
                      ) : (
                        <div className="flex space-x-1 py-1 not-prose">
                          <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                          <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                          <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                        </div>
                      )
                    ) : msg.content}
                  </div>
                  {msg.content?.trim() && (
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
                <div className="w-8 h-8 rounded-full bg-secondary border border-primary/30 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden relative">
                  <Sparkles className="w-4 h-4 text-primary/50 absolute" />
                  <img
                    src={`${import.meta.env.BASE_URL}images/avatar-bot.png`}
                    alt="Bot"
                    className="w-full h-full object-cover relative z-10"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="max-w-[82%] rounded-2xl p-4 bg-gradient-to-br from-white/[0.18] to-white/[0.08] border border-white/30 text-foreground rounded-tl-sm shadow-[0_8px_26px_rgba(0,0,0,0.38)] ring-1 ring-white/20">
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

          {/* Input */}
          <div className="px-4 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/80 backdrop-blur-xl border-t border-border shrink-0">
            {selectedContactId !== null && (
              <div className="space-y-2 mb-2 px-1">
                <div className="relative flex items-center gap-2 text-xs text-primary/70">
                  <span className="text-base leading-none shrink-0">⚯</span>
                  <span className="font-medium">Режим разбора</span>
                  <button
                    type="button"
                    aria-label="Подсказка по режимам разбора"
                    onClick={() => setShowContactModeHint((v) => !v)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary/30 text-primary/80 hover:bg-primary/10 transition"
                  >
                    <CircleHelp className="w-3.5 h-3.5" />
                  </button>

                  <AnimatePresence>
                    {showContactModeHint && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="absolute left-0 right-0 bottom-full mb-2 rounded-xl border border-primary/20 bg-card/95 backdrop-blur-sm p-3 text-xs text-foreground shadow-xl z-20"
                      >
                        <button
                          type="button"
                          onClick={() => setShowContactModeHint(false)}
                          className="absolute right-2 top-2 p-1 rounded-md hover:bg-white/5 text-muted-foreground"
                          aria-label="Закрыть подсказку"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <p className="pr-6">
                          По умолчанию Астробот разбирает характер человека и вашу связь прямо сейчас. За каждый вопрос спишется 1 запрос.
                        </p>
                        <p className="mt-1.5 pr-6 text-muted-foreground">
                          Но АстроБот может больше - включите галочку в чате с человеком и вы получите прогноз на несколько лет, углубленный анализ, детали. Каждый вопрос = 2 или 3 запроса (в зависимости от объема).
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="rounded border-border bg-background accent-primary shrink-0"
                    checked={contactExtendedMode}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setContactExtendedMode(next);
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
                    }}
                  />
                  <span>
                    Углубить разбор контакта —{' '}
                    <span className="text-primary/80 font-medium">
                      2 запроса за сообщение
                    </span>
                    <span className="text-muted-foreground"> (очень длинное — 3)</span>
                  </span>
                </label>
              </div>
            )}
            {inputValue.length > CHAR_COUNTER_THRESHOLD && (
              <div className={`text-right text-xs mb-1 tabular-nums ${inputValue.length > MAX_CHAT_MESSAGE_CHARS ? 'text-destructive font-medium' : inputValue.length > MAX_CHAT_MESSAGE_CHARS * 0.9 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                {inputValue.length}/{MAX_CHAT_MESSAGE_CHARS}
              </div>
            )}
            <form onSubmit={handleSend} className="relative flex items-end">
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
                disabled={!inputValue.trim() || isStreaming}
                onPointerDown={() => {
                  if (isStreaming || !inputValue.trim()) return;
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
          {/* Spacer so content isn't hidden behind the fixed bottom nav */}
          <div className="shrink-0" style={{ height: 'calc(2.5rem + env(safe-area-inset-bottom, 0px))' }} />
        </div>
      </AppLayout>

      <BottomNav
        activeTab={showHistory ? 'chats' : showProfile ? 'profile' : null}
        onChatsClick={() => {
          if (showProfile) setShowProfile(false);
          setShowHistory((v) => !v);
        }}
        onProfileClick={() => {
          if (showHistory) setShowHistory(false);
          setShowProfile((v) => !v);
        }}
      />

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
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            onClick={() => setContextSwitchTargetId(undefined)}
          />
          <div className="fixed left-3 right-3 z-[71] rounded-2xl border border-border bg-card p-4 shadow-2xl" style={{ bottom: 'calc(3rem + env(safe-area-inset-bottom, 0px) + 0.5rem)' }}>
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
