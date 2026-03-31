import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface DateInputProps {
  value: string; // ISO: YYYY-MM-DD
  onChange: (isoDate: string) => void;
  className?: string;
}

function isValidDate(day: number, month: number, year: number): boolean {
  if (year < 1900 || year > new Date().getFullYear()) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  return day >= 1 && day <= daysInMonth;
}

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

export function DateInput({ value, onChange, className }: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d]/g, '');

    // Auto-insert dots
    let formatted = '';
    if (raw.length > 0) formatted += raw.slice(0, 2);
    if (raw.length > 2) formatted += '.' + raw.slice(2, 4);
    if (raw.length > 4) formatted += '.' + raw.slice(4, 8);

    setDisplay(formatted);
    setError('');

    // Only validate + emit when fully typed (DD.MM.YYYY = 10 chars)
    if (formatted.length === 10) {
      const parts = formatted.split('.');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      if (!isValidDate(day, month, year)) {
        setError('Некорректная дата');
        onChange('');
      } else {
        const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onChange(iso);
      }
    } else {
      onChange('');
    }
  };

  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder="ДД.ММ.ГГГГ"
        maxLength={10}
        className={cn(
          "w-full bg-card/50 backdrop-blur-sm border rounded-xl text-foreground",
          "focus:outline-none focus:ring-1 transition-all duration-300 px-4 py-3.5",
          error
            ? "border-red-500 focus:border-red-500 focus:ring-red-500/50"
            : "border-border focus:border-primary focus:ring-primary/50",
          className
        )}
      />
      {error && (
        <p className="text-red-400 text-xs mt-1 pl-1">{error}</p>
      )}
    </div>
  );
}
