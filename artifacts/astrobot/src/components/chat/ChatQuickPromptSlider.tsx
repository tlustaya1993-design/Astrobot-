import React from 'react';
import { motion } from 'framer-motion';

export type QuickPromptItem = {
  label: string;
  prompt: string;
};

interface Props {
  prompts: QuickPromptItem[];
  onSelect: (prompt: string) => void;
  reduceMotion?: boolean;
  /** Пустой личный экран: вытянутые чипы в одну строку со скроллом */
  variant?: 'starter' | 'default';
}

export default function ChatQuickPromptSlider({
  prompts,
  onSelect,
  reduceMotion,
  variant = 'default',
}: Props) {
  if (prompts.length === 0) return null;

  const isStarter = variant === 'starter';

  return (
    <div
      className={`chat-quick-prompts mb-2.5 flex gap-2 overflow-x-auto px-4 scrollbar-none ${
        isStarter ? 'chat-quick-prompts--starter flex-nowrap' : ''
      }`}
    >
      {prompts.map((item) => (
        <motion.button
          key={item.label}
          type="button"
          onClick={() => onSelect(item.prompt)}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          className={`chat-quick-prompt-chip inline-flex shrink-0 items-center ${
            isStarter ? 'chat-quick-prompt-chip--starter' : ''
          }`}
        >
          {item.label}
        </motion.button>
      ))}
    </div>
  );
}
