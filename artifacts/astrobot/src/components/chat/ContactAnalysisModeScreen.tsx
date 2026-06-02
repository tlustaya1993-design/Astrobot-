import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  extended: boolean;
  onChange: (extended: boolean) => void;
}

function ModeCard({
  title,
  description,
  cost,
  selected,
  onSelect,
}: {
  title: string;
  description: string;
  cost: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-2xl border p-4 transition-all',
        selected
          ? 'border-primary/50 bg-primary/[0.08] shadow-[0_0_24px_rgba(212,175,55,0.12)]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
            <p className="text-xs text-primary/80 mt-2">{cost}</p>
          </div>
        </div>
        <div
          className={cn(
            'w-11 h-6 rounded-full shrink-0 transition-colors relative',
            selected ? 'bg-primary' : 'bg-muted',
          )}
          aria-hidden
        >
          <div
            className={cn(
              'absolute top-0.5 w-5 h-5 rounded-full bg-background shadow transition-transform',
              selected ? 'translate-x-[22px]' : 'translate-x-0.5',
            )}
          />
        </div>
      </div>
    </button>
  );
}

export default function ContactAnalysisModeScreen({ extended, onChange }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center w-full max-w-md mx-auto py-4 px-1"
    >
      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/25 flex items-center justify-center mb-5 shadow-[0_0_32px_rgba(212,175,55,0.2)]">
        <Sparkles className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-xl font-display font-bold text-center mb-1">Выбери режим разбора</h3>
      <p className="text-sm text-primary/85 text-center mb-6 leading-relaxed">
        От этого зависит глубина и детализация ответа
      </p>

      <div className="w-full space-y-3">
        <ModeCard
          title="Базовый разбор"
          description="Быстрый ответ по ключевым аспектам карты"
          cost="1 запрос за сообщение"
          selected={!extended}
          onSelect={() => onChange(false)}
        />
        <ModeCard
          title="Глубокий разбор"
          description="Больше аспектов, больше деталей и длиннее ответ"
          cost="2 запроса за сообщение"
          selected={extended}
          onSelect={() => onChange(true)}
        />
      </div>

      <p className="text-xs text-muted-foreground mt-5 text-center">
        Режим можно изменить в любой момент <span className="text-primary/70">✦</span>
      </p>
    </motion.div>
  );
}
