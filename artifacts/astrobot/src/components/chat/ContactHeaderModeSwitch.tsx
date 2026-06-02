import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  extended: boolean;
  onChange: (extended: boolean) => void;
  disabled?: boolean;
}

export default function ContactHeaderModeSwitch({ extended, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label = extended ? 'Глубокий' : 'Базовый';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-xs font-medium border transition-colors',
          extended
            ? 'border-primary/40 bg-primary/15 text-primary'
            : 'border-white/15 bg-white/5 text-foreground/85',
          disabled && 'opacity-50 pointer-events-none',
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{label}</span>
        <span
          className={cn(
            'w-8 h-[18px] rounded-full relative transition-colors',
            extended ? 'bg-primary' : 'bg-muted',
          )}
          aria-hidden
        >
          <span
            className={cn(
              'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-background shadow transition-transform',
              extended ? 'translate-x-[16px]' : 'translate-x-[2px]',
            )}
          />
        </span>
        <ChevronDown className={cn('w-3.5 h-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] rounded-xl border border-border bg-card/98 backdrop-blur-md shadow-xl py-1"
        >
          <ModeOption
            title="Глубокий разбор"
            selected={extended}
            onClick={() => {
              onChange(true);
              setOpen(false);
            }}
          />
          <ModeOption
            title="Базовый разбор"
            selected={!extended}
            dotClass="bg-violet-500"
            onClick={() => {
              onChange(false);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ModeOption({
  title,
  selected,
  onClick,
  dotClass = 'text-primary',
}: {
  title: string;
  selected: boolean;
  onClick: () => void;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-white/5 transition-colors"
    >
      {title === 'Глубокий разбор' ? (
        <Sparkles className="w-4 h-4 text-primary shrink-0" />
      ) : (
        <span className={cn('w-2 h-2 rounded-full shrink-0', dotClass)} />
      )}
      <span className="flex-1">{title}</span>
      {selected && <Check className="w-4 h-4 text-primary shrink-0" />}
    </button>
  );
}
