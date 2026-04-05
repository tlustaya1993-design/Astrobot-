import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { getAuthHeaders } from '@/lib/session';

interface ForecastData {
  date: string;
  text: string;
  moonPhase: { name: string; emoji: string };
}

interface Props {
  onAskQuestion?: (question: string) => void;
  hidden?: boolean;
  onToggleHidden?: () => void;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00Z');
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

function isForecastData(value: unknown): value is ForecastData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ForecastData>;
  return (
    typeof v.date === 'string' &&
    typeof v.text === 'string' &&
    !!v.moonPhase &&
    typeof v.moonPhase.name === 'string' &&
    typeof v.moonPhase.emoji === 'string'
  );
}

export default function DailyForecastCard({ onAskQuestion, hidden = false, onToggleHidden }: Props) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const [error, setError] = useState(false);

  useEffect(() => {
    // Check local cache first
    const cacheKey = `daily-forecast-${getToday()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as unknown;
        if (isForecastData(parsed)) {
          setData(parsed);
          setLoading(false);
          return;
        }
        sessionStorage.removeItem(cacheKey);
      } catch { /* ignore */ }
    }

    fetch(`${import.meta.env.BASE_URL}api/openai/daily-forecast`, {
      headers: getAuthHeaders(),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`daily-forecast failed: ${r.status}`);
        return r.json();
      })
      .then((payload: unknown) => {
        if (!isForecastData(payload)) throw new Error('Invalid forecast payload');
        setData(payload);
        sessionStorage.setItem(cacheKey, JSON.stringify(payload));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (hidden) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mx-auto w-full max-w-md"
      >
        <div className="rounded-2xl border border-border/40 bg-card/80 px-3 sm:px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground min-w-0 flex-1">Прогноз на день скрыт</p>
            {onToggleHidden && (
              <button
                type="button"
                onClick={onToggleHidden}
                className="text-xs min-h-[44px] px-4 py-2 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition touch-manipulation"
              >
                Показать
              </button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (error || (!loading && !data)) return null;

  const sentences = data?.text
    ? data.text.split(/(?<=[.!?])\s+/).filter(Boolean)
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mx-auto w-full max-w-md"
    >
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card/95 to-secondary/30 shadow-[0_0_20px_rgba(212,175,55,0.07)] overflow-hidden">
        {/* Header */}
        <div className="w-full flex flex-wrap items-center gap-2 justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex-1 min-w-[min(100%,12rem)] flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors rounded-lg py-2 pl-1 pr-2 -my-0.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">
                {loading ? '🌙' : (data?.moonPhase.emoji || '✨')}
              </span>
              <div className="text-left">
                <p className="text-xs text-primary/70 font-medium tracking-wide uppercase leading-none mb-0.5">
                  Прогноз на сегодня
                </p>
                {data && (
                  <p className="text-xs text-muted-foreground leading-none">
                    {data.moonPhase.name && `${data.moonPhase.name} · `}{formatDate(data.date)}
                  </p>
                )}
              </div>
            </div>
            <div className="text-muted-foreground/50">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>
          {onToggleHidden && (
            <button
              type="button"
              onClick={onToggleHidden}
              className="shrink-0 text-xs min-h-[44px] min-w-[44px] sm:min-w-0 px-3 py-2 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition touch-manipulation"
            >
              Скрыть
            </button>
          )}
        </div>

        {/* Preview (first sentence always visible) */}
        <div className="px-3 sm:px-4 pb-3 pt-0.5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-primary/50" />
              <span>Читаю звёзды...</span>
            </div>
          ) : sentences.length > 0 ? (
            <p className="text-sm text-foreground/90 leading-relaxed">
              {sentences[0]}
            </p>
          ) : null}
        </div>

      </div>

      {/* Оверлей в document.body: fixed не ломается из‑за transform предков; «Скрыть» внутри шторки */}
      {portalReady &&
        createPortal(
          <AnimatePresence>
            {expanded && sentences.length > 1 && (
              <>
                <motion.div
                  key="forecast-backdrop"
                  className="fixed inset-0 z-[135] bg-black/55 backdrop-blur-sm touch-none"
                  style={{ top: 0, left: 0, right: 0, bottom: 0 }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setExpanded(false)}
                  aria-hidden
                />
                <motion.div
                  key="forecast-sheet"
                  className="fixed inset-x-0 bottom-0 z-[140] flex justify-center px-3 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] pointer-events-none"
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '100%', opacity: 0 }}
                  transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                >
                  <div className="w-full max-w-lg pointer-events-auto max-h-[min(88dvh,640px)] flex flex-col rounded-2xl border border-primary/25 bg-card shadow-2xl overflow-hidden">
                    <div className="shrink-0 bg-card/98 backdrop-blur-md border-b border-white/5 px-3 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 min-h-[44px]">
                        <p className="text-sm font-medium text-foreground truncate pr-2">Прогноз на день</p>
                        <button
                          type="button"
                          onClick={() => setExpanded(false)}
                          className="shrink-0 text-xs min-h-[44px] px-3 py-2 rounded-full border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/30 transition touch-manipulation"
                        >
                          Закрыть
                        </button>
                      </div>
                      {onToggleHidden && (
                        <button
                          type="button"
                          onClick={() => {
                            setExpanded(false);
                            onToggleHidden();
                          }}
                          className="w-full text-xs min-h-[44px] py-2.5 rounded-xl border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/35 hover:bg-primary/5 transition touch-manipulation"
                        >
                          Скрыть прогноз на сегодня
                        </button>
                      )}
                    </div>
                    <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 space-y-2">
                      {sentences.slice(1).map((s, i) => (
                        <p key={i} className="text-sm text-foreground/80 leading-relaxed">
                          {s}
                        </p>
                      ))}

                      {onAskQuestion && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {[
                            "Расскажи подробнее о сегодняшней энергии",
                            "Что мне стоит сделать сегодня?",
                            "Какие транзиты активны сейчас?",
                          ].map((q, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                onAskQuestion(q);
                                setExpanded(false);
                              }}
                              className="text-xs px-3 py-2 min-h-[40px] rounded-full bg-primary/10 border border-primary/20 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors touch-manipulation text-left"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </motion.div>
  );
}
