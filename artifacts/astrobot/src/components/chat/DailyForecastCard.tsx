import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getAuthHeaders } from '@/lib/session';
import AstroMarkdown from '@/components/chat/AstroMarkdown';

interface ForecastData {
  date: string;
  text: string;
  moonPhase: { name: string; emoji: string };
}

interface Props {
  onAskQuestion?: (question: string) => void;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

export default function DailyForecastCard({ onAskQuestion }: Props) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Check local cache first
    const cacheKey = `daily-forecast-${getToday()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Partial<ForecastData>;
        if (typeof parsed?.text === 'string' && parsed?.moonPhase?.emoji) {
          setData(parsed as ForecastData);
          setLoading(false);
          return;
        }
      } catch { /* ignore */ }
    }

    fetch(`${import.meta.env.BASE_URL}api/openai/daily-forecast`, {
      headers: getAuthHeaders(),
    })
      .then(async (r) => {
        const d = (await r.json()) as Partial<ForecastData>;
        if (!r.ok || typeof d?.text !== 'string' || !d?.moonPhase?.emoji) {
          setError(true);
          return;
        }
        const payload: ForecastData = {
          date: d.date ?? getToday(),
          text: d.text,
          moonPhase: {
            name: d.moonPhase?.name ?? '',
            emoji: d.moonPhase.emoji,
          },
        };
        setData(payload);
        sessionStorage.setItem(cacheKey, JSON.stringify(payload));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (error || (!loading && (!data || !data.moonPhase))) return null;

  // Strip leading markdown headings (# Title) and trim
  const cleanText = data?.text
    ? data.text.replace(/^#+\s+[^\n]*\n?/, '').trim()
    : '';

  const sentences = cleanText
    ? cleanText.split(/(?<=[.!?])\s+/).filter(Boolean)
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
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">
              {loading ? '🌙' : (data?.moonPhase?.emoji ?? '✨')}
            </span>
            <div className="text-left">
              <p className="text-xs text-primary/70 font-medium tracking-wide uppercase leading-none mb-0.5">
                Прогноз на сегодня
              </p>
              {data && (
                <p className="text-xs text-muted-foreground leading-none">
                  {data.moonPhase?.name && `${data.moonPhase.name} · `}{formatDate(data.date)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground/70">
            <span className="text-[11px]">
              {expanded ? 'Скрыть' : 'Развернуть'}
            </span>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && sentences.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-2 border-t border-white/5 pt-3">
                {sentences.map((s, i) => (
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
