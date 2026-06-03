import React from 'react';
import { motion } from 'framer-motion';
import type { FollowUpChip } from '@/lib/follow-up-chips';

type Props = {
  chips: FollowUpChip[];
  disabled?: boolean;
  reduceMotion?: boolean;
  onSelect: (chip: FollowUpChip) => void;
};

export default function FollowUpChips({ chips, disabled, reduceMotion, onSelect }: Props) {
  if (chips.length === 0) return null;

  return (
    <div className="mt-3 w-full min-w-0" data-testid="follow-up-chips">
      <div className="flex flex-col gap-2">
        {chips.map((chip) => (
          <motion.button
            key={`${chip.isAffirm ? 'affirm' : 'topic'}-${chip.prompt}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(chip)}
            whileTap={disabled || reduceMotion ? undefined : { scale: 0.98 }}
            className={[
              'chat-quick-prompt-chip chat-follow-up-chip inline-flex w-full items-center text-left',
              chip.isAffirm ? 'chat-follow-up-chip--affirm' : '',
            ].join(' ')}
          >
            {chip.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
