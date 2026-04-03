import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { Send, Sparkles, ChevronLeft, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { useGetOpenaiConversation } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { useChatStream } from '@/hooks/use-chat-stream';
import AstroMarkdown from '@/components/chat/AstroMarkdown';
import PeoplePanel from '@/components/chat/PeoplePanel';
import HistoryDrawer from '@/components/chat/HistoryDrawer';
import ChatSidebar from '@/components/chat/ChatSidebar';
import AuthModal from '@/components/AuthModal';
import DailyForecastCard from '@/components/chat/DailyForecastCard';

const SUGGESTED_PROMPTS = [
  "Расскажи о моей натальной карте",
  "Что значат мои транзиты сейчас?",
  "Какой период сейчас в моей жизни?",
  "Разбери мою Часть Удачи"
];

export default function Chat() {
  const [match, params] = useRoute('/chat/:id');
  const [, setLocation] = useLocation();
  const conversationId = match && params?.id ? parseInt(params.id, 10) : undefined;

  const { data: conversation, isLoading } = useGetOpenaiConversation(
    conversationId || 0,
    {
      request: { headers: getAuthHeaders() },
      query: { enabled: !!conversationId }
    }
  );

  const { localMessages, isStreaming, streamingText, sendMessage, clearLocalMessages } = useChatStream(conversationId);
  const [inputValue, setInputValue] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

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

  const displayMessages = localMessages.length > 0
    ? (conversation?.messages ? [...conversation.messages.filter(m => !localMessages.find(lm => lm.content === m.content)), ...localMessages] : localMessages)
    : (conversation?.messages || []);

  useEffect(() => {
    if (!autoScrollEnabled) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, streamingText, autoScrollEnabled]);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const shouldStickToBottom = distanceToBottom < 80;
    setAutoScrollEnabled(shouldStickToBottom);
  };

  useEffect(() => {
    clearLocalMessages();
  }, [conversationId]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isStreaming) return;
    const text = inputValue.trim();
    setInputValue('');
    const newConvId = await sendMessage(text, selectedContactId);
    if (!conversationId && newConvId) {
      setLocation(`/chat/${newConvId}`, { replace: true });
    }
  };

  const isNew = !conversationId && displayMessages.length === 0;

  const BotBadge = () => (
    <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
      <Sparkles className="w-4 h-4 text-primary" />
    </div>
  );

  return (
    <>
      <AppLayout>
        <div className="flex-1 min-h-0 md:grid md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr]">
          <div
            className={`hidden md:block border-r border-border/50 bg-background/60 backdrop-blur-xl ${
              isDesktopSidebarCollapsed ? 'md:w-0 md:min-w-0 md:overflow-hidden md:border-r-0' : ''
            }`}
          >
            <ChatSidebar
              currentConversationId={conversationId}
              onLoginClick={() => setShowAuthModal(true)}
            />
          </div>

          <div
            className="flex-1 flex flex-col min-h-0"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Header */}
            <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 flex items-center justify-between shadow-sm">
              {conversationId ? (
                <button
                  onClick={() => setLocation('/chat')}
                  className="p-2 -ml-2 rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition md:hidden"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              ) : (
                <button
                  onClick={() => setShowHistory(true)}
                  className="p-2 -ml-2 rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition md:hidden"
                  aria-label="Открыть историю"
                >
                  <Menu className="w-6 h-6" />
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsDesktopSidebarCollapsed((prev) => !prev)}
                  className="hidden md:inline-flex p-2 rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition"
                  aria-label={isDesktopSidebarCollapsed ? "Показать список чатов" : "Скрыть список чатов"}
                  title={isDesktopSidebarCollapsed ? "Показать список чатов" : "Скрыть список чатов"}
                >
                  {isDesktopSidebarCollapsed ? (
                    <PanelLeftOpen className="w-5 h-5" />
                  ) : (
                    <PanelLeftClose className="w-5 h-5" />
                  )}
                </button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent p-[1px]">
                  <BotBadge />
                </div>
                <h2 className="font-display font-semibold text-lg">AstroBot</h2>
              </div>

              <div className="w-10 md:hidden" />
            </header>

            {/* People Panel */}
            <PeoplePanel selectedContactId={selectedContactId} onSelect={setSelectedContactId} />

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto p-4 space-y-6"
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
                className="flex flex-col items-center justify-center py-8 text-center"
              >
                {/* Daily Forecast Card */}
                {!selectedContactId && (
                  <div className="w-full max-w-md mb-6">
                    <DailyForecastCard onAskQuestion={(q) => { setInputValue(q); }} />
                  </div>
                )}

                <div className="w-16 h-16 rounded-full bg-secondary/50 border border-primary/20 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(212,175,55,0.15)]">
                  <Sparkles className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-2">О чём спросить звёзды?</h3>
                <p className="text-muted-foreground mb-6 max-w-sm text-sm">
                  {selectedContactId
                    ? "Режим синастрии активен. Спросите о совместимости."
                    : "Спрашивайте о вашей карте, текущих транзитах или жизненных вопросах."}
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  {(selectedContactId
                    ? ["Расскажи о нашей синастрии", "Какие у нас сильные аспекты?", "Есть ли напряжение в нашей карте?", "Что звёзды говорят о нас?"]
                    : SUGGESTED_PROMPTS
                  ).map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInputValue(prompt)}
                      className="px-4 py-2 rounded-full text-sm bg-card border border-border hover:border-primary/50 hover:bg-white/5 transition-all text-left"
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-secondary border border-primary/30 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden">
                    <Sparkles className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[82%] rounded-2xl p-4 shadow-lg ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 text-foreground rounded-tr-sm'
                    : 'bg-card border border-white/5 text-foreground rounded-tl-sm prose prose-invert prose-p:leading-relaxed prose-sm max-w-none'
                }`}>
                  {msg.role === 'assistant' ? <AstroMarkdown content={msg.content} /> : msg.content}
                </div>
              </motion.div>
            ))}

            {isStreaming && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                <div className="w-8 h-8 rounded-full bg-secondary border border-primary/30 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div className="max-w-[82%] rounded-2xl p-4 shadow-lg bg-card border border-white/5 text-foreground rounded-tl-sm prose prose-invert prose-sm max-w-none">
                  {streamingText ? <AstroMarkdown content={streamingText} /> : (
                    <div className="flex space-x-1 py-1">
                      <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                      <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                      <svg className="w-1.5 h-1.5 text-primary typing-dot" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

              <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input */}
            <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background/80 backdrop-blur-xl border-t border-border shrink-0">
              {selectedContactId !== null && (
                <div className="flex items-center gap-1.5 text-xs text-primary/60 mb-2 px-1">
                  <span className="text-base leading-none">⚯</span>
                  <span>Синастрия активна — вопросы будут разобраны с учётом карты выбранного человека</span>
                </div>
              )}
              <form onSubmit={handleSend} className="relative flex items-center">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={selectedContactId ? "Спросите о совместимости..." : "Спросите звёзды..."}
                  className="w-full bg-card border border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded-full py-3.5 pl-5 pr-14 text-foreground placeholder:text-muted-foreground outline-none transition-all shadow-inner shadow-black/50"
                  disabled={isStreaming}
                />
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isStreaming}
                  className="absolute right-2 p-2 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              </form>
            </div>
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
    </>
  );
}
