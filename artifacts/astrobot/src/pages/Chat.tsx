import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Send, Sparkles, ChevronLeft, Menu } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { useGetOpenaiConversation } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { useChatStream } from '@/hooks/use-chat-stream';
import AstroMarkdown from '@/components/chat/AstroMarkdown';
import PeoplePanel from '@/components/chat/PeoplePanel';
import HistoryDrawer from '@/components/chat/HistoryDrawer';
import AuthModal from '@/components/AuthModal';
import DailyForecastCard from '@/components/chat/DailyForecastCard';
import PaywallSheet from '@/components/billing/PaywallSheet';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { getToken } from '@/lib/session';

const POST_PAYMENT_REGISTER_NUDGE_KEY = 'astrobot_post_payment_register_nudge';

const SUGGESTED_PROMPTS = [
  "Расскажи о моей натальной карте",
  "Что значат мои транзиты сейчас?",
  "Какой период сейчас в моей жизни?",
  "Разбери мою Часть Удачи"
];

export default function Chat() {
  const [match, params] = useRoute('/chat/:id');
  const [, setLocation] = useLocation();
  const { isLoggedIn, openAuthModal } = useAuth();
  const [showPostPaymentRegisterNudge, setShowPostPaymentRegisterNudge] = useState(false);
  const conversationId = match && params?.id ? parseInt(params.id, 10) : undefined;

  const { data: conversation, isLoading } = useGetOpenaiConversation(
    conversationId || 0,
    {
      request: { headers: getAuthHeaders() },
      query: { enabled: !!conversationId }
    }
  );

  const {
    localMessages,
    isStreaming,
    sendMessage,
    clearLocalMessages,
    paywallState,
    closePaywall,
  } = useChatStream(conversationId);
  const [inputValue, setInputValue] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    resizeComposer();
  }, [inputValue]);

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

  const dismissPostPaymentNudge = () => {
    try {
      sessionStorage.removeItem(POST_PAYMENT_REGISTER_NUDGE_KEY);
    } catch {
      /* ignore */
    }
    setShowPostPaymentRegisterNudge(false);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isStreaming) return;
    const text = inputValue.trim();
    setInputValue('');
    requestAnimationFrame(() => resizeComposer());
    const newConvId = await sendMessage(text, selectedContactId);
    if (!conversationId && newConvId) {
      setLocation(`/chat/${newConvId}`, { replace: true });
    }
  };

  const isNew = !conversationId && displayMessages.length === 0;

  return (
    <>
      <AppLayout>
        <div
          className="flex-1 flex flex-col min-h-0"
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
              <button
                onClick={() => setShowHistory(true)}
                className="p-1.5 -ml-1 rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition"
                aria-label="Открыть историю"
              >
                <Menu className="w-5 h-5" />
              </button>
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
          <PeoplePanel selectedContactId={selectedContactId} onSelect={setSelectedContactId} />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
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
                <p className="text-muted-foreground mb-3 max-w-sm text-sm">
                  {selectedContactId
                    ? "Режим синастрии активен. Спросите о совместимости."
                    : "Спрашивайте о вашей карте, текущих транзитах или жизненных вопросах."}
                </p>
                <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                  {(selectedContactId
                    ? ["Расскажи о нашей синастрии", "Какие у нас сильные аспекты?", "Есть ли напряжение в нашей карте?", "Что звёзды говорят о нас?"]
                    : SUGGESTED_PROMPTS
                  ).map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInputValue(prompt)}
                      className="w-full px-4 py-2 rounded-2xl text-sm bg-card border border-border hover:border-primary/50 hover:bg-white/5 transition-all text-center leading-snug"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {displayMessages.map((msg, idx) => (
              <motion.div
                key={msg.id || idx}
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
                <div className={`max-w-[82%] rounded-2xl p-4 shadow-lg ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 text-foreground rounded-tr-sm'
                    : 'bg-card border border-white/5 text-foreground rounded-tl-sm prose prose-invert prose-p:leading-relaxed prose-sm max-w-none'
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
              </motion.div>
            ))}

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
                <div className="max-w-[82%] rounded-2xl p-4 shadow-lg bg-card border border-white/5 text-foreground rounded-tl-sm">
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
              <div className="flex items-center gap-1.5 text-xs text-primary/60 mb-2 px-1">
                <span className="text-base leading-none">⚯</span>
                <span>Синастрия активна — вопросы будут разобраны с учётом карты выбранного человека</span>
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
                placeholder={selectedContactId ? "Спросите о совместимости..." : "Спросите звёзды..."}
                rows={1}
                className="w-full min-h-[52px] max-h-[140px] resize-none overflow-y-auto bg-card border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded-3xl py-3 pl-4 pr-14 text-foreground placeholder:text-muted-foreground outline-none transition-all shadow-inner shadow-black/50 leading-relaxed"
                disabled={isStreaming}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isStreaming}
                className="absolute right-2 bottom-2 p-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="w-4 h-4 ml-0.5" />
              </button>
            </form>
          </div>
        </div>
      </AppLayout>

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
    </>
  );
}
