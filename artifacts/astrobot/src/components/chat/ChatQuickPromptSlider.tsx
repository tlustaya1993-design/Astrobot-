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
}

export default function ChatQuickPromptSlider({ prompts, onSelect, reduceMotion }: Props) {
  if (prompts.length === 0) return null;

  return (
    <div
      data-tutorial-id="quick-topics"
      className="chat-quick-prompts mb-2.5 flex gap-2 overflow-x-auto px-4 scrollbar-none"
    >
      {prompts.map((item) => (
        <motion.button
          key={item.label}
          type="button"
          onClick={() => onSelect(item.prompt)}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          className="chat-quick-prompt-chip inline-flex shrink-0 items-center"
        >
          {item.label}
        </motion.button>
      ))}
    </div>
  );
}
