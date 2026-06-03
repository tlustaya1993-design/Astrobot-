import React from 'react';
import { motion } from 'framer-motion';
import ContactAnalysisModeSegment from '@/components/chat/ContactAnalysisModeSegment';

interface Props {
  extended: boolean;
  onChange: (extended: boolean) => void;
}

export default function ContactAnalysisModeScreen({ extended, onChange }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-md px-1 py-2"
    >
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
        <p className="text-sm font-semibold text-foreground">Режим разбора</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          От этого зависит глубина и детализация ответа
        </p>

        <div className="mt-4">
          <ContactAnalysisModeSegment extended={extended} onChange={onChange} />
        </div>

        <div className="mt-4 border-t border-white/[0.06] pt-3">
          {extended ? (
            <>
              <p className="text-sm text-foreground/90">Глубокий разбор</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Больше аспектов, больше деталей и длиннее ответ
              </p>
              <p className="mt-2 text-xs text-[#d4a93a]/85">2 запроса за сообщение</p>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground/90">Базовый разбор</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Быстрый ответ по ключевым аспектам карты
              </p>
              <p className="mt-2 text-xs text-[#d4a93a]/85">1 запрос за сообщение</p>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Режим можно изменить в любой момент
        </p>
      </div>
    </motion.div>
  );
}
