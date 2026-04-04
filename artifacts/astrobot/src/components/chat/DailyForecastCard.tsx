import React, { useState, useEffect } from 'react';
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
  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
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
        className="mx-auto w-full max-w-md mb-4"
      >
        <div className="rounded-2xl border border-border/40 bg-card/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Прогноз на день скрыт</p>
            {onToggleHidden && (
              <button
                onClick={onToggleHidden}
                className="text-xs px-3 py-1.5 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition"
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
      className="mx-auto w-full max-w-md mb-4"
    >
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card/95 to-secondary/30 shadow-[0_0_20px_rgba(212,175,55,0.07)] overflow-hidden">
        {/* Header */}
        <div className="w-full flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-1 min-w-0 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors rounded-lg -my-1 py-1 px-1 -ml-1"
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
              onClick={onToggleHidden}
              className="ml-2 text-[11px] px-2.5 py-1 rounded-full border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/30 transition"
            >
              Скрыть
            </button>
          )}
        </div>

        {/* Preview (first sentence always visible) */}
        <div className="px-4 pb-3">
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

        {/* Expanded content as overlay so chat layout doesn't jump */}
        <AnimatePresence>
          {expanded && sentences.length > 1 && (
            <>
              <motion.div
                className="fixed inset-0 z-[115] bg-black/55 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setExpanded(false)}
              />
              <motion.div
                className="fixed inset-x-0 bottom-0 z-[120] flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]"
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              >
                <div className="w-full max-w-lg rounded-2xl border border-primary/25 bg-card shadow-2xl max-h-[70vh] overflow-y-auto">
                  <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Прогноз на день</p>
                    <button
                      onClick={() => setExpanded(false)}
                      className="text-xs px-2.5 py-1 rounded-full border border-border/40 text-muted-foreground hover:text-foreground hover:border-primary/30 transition"
                    >
                      Закрыть
                    </button>
                  </div>
                  <div className="px-4 pb-4 pt-3 space-y-2">
                    {sentences.slice(1).map((s, i) => (
                      <p key={i} className="text-sm text-foreground/80 leading-relaxed">
                        {s}
                      </p>
                    ))}

                    {/* Quick follow-up prompts */}
                    {onAskQuestion && (
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {[
                          "Расскажи подробнее о сегодняшней энергии",
                          "Что мне стоит сделать сегодня?",
                          "Какие транзиты активны сейчас?",
                        ].map((q, i) => (
                          <button
                            key={i}
                            onClick={() => { onAskQuestion(q); setExpanded(false); }}
                            className="text-xs px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors"
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
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
