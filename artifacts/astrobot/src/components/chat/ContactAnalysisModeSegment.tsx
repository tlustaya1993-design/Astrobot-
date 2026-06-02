import React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  extended: boolean;
  onChange: (extended: boolean) => void;
  disabled?: boolean;
  size?: 'default' | 'compact';
}

function Segment({
  active,
  onClick,
  children,
  compact,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded-full font-medium transition-colors',
        compact
          ? 'min-w-[4.85rem] shrink-0 px-3 py-1.5 text-[11px] leading-none'
          : 'flex-1 px-4 py-2.5 text-sm leading-none',
        active
          ? 'border border-[rgba(200,160,50,0.45)] bg-[rgba(255,220,100,0.12)] text-[#d4a93a] shadow-[0_0_12px_rgba(212,175,55,0.08)]'
          : 'border border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground/90',
      )}
    >
      {children}
    </button>
  );
}

export default function ContactAnalysisModeSegment({
  extended,
  onChange,
  disabled,
  size = 'default',
}: Props) {
  const compact = size === 'compact';

  return (
    <div
      role="tablist"
      aria-label="Режим разбора"
      className={cn(
        'flex gap-0.5 rounded-full border border-white/10 bg-white/[0.05] p-0.5',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <Segment active={!extended} onClick={() => onChange(false)} compact={compact}>
        Базовый
      </Segment>
      <Segment active={extended} onClick={() => onChange(true)} compact={compact}>
        Глубокий
      </Segment>
    </div>
  );
}
