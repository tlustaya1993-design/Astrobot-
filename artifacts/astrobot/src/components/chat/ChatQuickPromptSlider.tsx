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
          className="inline-flex h-10 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.07] px-4 text-[13px] leading-none text-white/[0.82] backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.11]"
        >
          {item.label}
        </motion.button>
      ))}
    </div>
  );
}
