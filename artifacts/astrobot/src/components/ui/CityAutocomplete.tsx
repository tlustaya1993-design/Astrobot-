import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CityResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface Props {
  value: string;
  onChange: (value: string, lat?: number, lng?: number) => void;
  placeholder?: string;
  className?: string;
  onFocusInput?: (el: HTMLInputElement) => void;
  /**
   * Draft callback: вызывается при наборе текста (без координат).
   * Используется для сброса "выбранности" города на стороне родителя.
   */
  onDraftChange?: (draft: string) => void;
}

function getCityLabel(result: CityResult): string {
  const a = result.address;
  if (!a) {
    return result.display_name.split(',').slice(0, 2).join(',').trim();
  }
  const city = a.city || a.town || a.village;
  const region = a.state || a.county;
  const country = a.country;
  const parts = [city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : result.display_name.split(',').slice(0, 2).join(',').trim();
}

export function CityAutocomplete({
  value,
  onChange,
  placeholder = 'Город рождения',
  className,
  onFocusInput,
  onDraftChange,
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<CityResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevVvHeightRef = useRef<number | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'ru,en' },
      });
      const data: CityResult[] = await res.json();
      const unique = data.filter((r, i, arr) => {
        const label = getCityLabel(r);
        return arr.findIndex(x => getCityLabel(x) === label) === i;
      }).slice(0, 5);
      setResults(unique);
      setIsOpen(unique.length > 0);
      setSelectedIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const listRef = useRef<HTMLDivElement>(null);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});

  const updateListPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const visibleH = vv?.height ?? window.innerHeight;
    const spaceBelow = visibleH - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const maxHeight = Math.min(220, Math.max(96, Math.max(spaceBelow, spaceAbove) - 8));
    const openAbove = spaceBelow < 120 && spaceAbove > spaceBelow;

    setListStyle({
      position: 'fixed',
      top: openAbove ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      maxHeight,
      zIndex: 9999,
      overflowY: 'auto',
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query === value) return;
    debounceRef.current = setTimeout(() => void search(query), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value, search]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useLayoutEffect(() => {
    if (!isOpen || results.length === 0) return;
    updateListPosition();
  }, [isOpen, results, updateListPosition]);

  useEffect(() => {
    if (!isOpen) return;
    const onScrollOrResize = () => updateListPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onScrollOrResize);
    vv?.addEventListener('scroll', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      vv?.removeEventListener('resize', onScrollOrResize);
      vv?.removeEventListener('scroll', onScrollOrResize);
    };
  }, [isOpen, updateListPosition]);

  // Close and reset when iOS keyboard dismisses (viewport grows).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    prevVvHeightRef.current = vv.height;
    const onVvResize = () => {
      const prev = prevVvHeightRef.current ?? vv.height;
      if (vv.height > prev + 60) {
        setIsOpen(false);
      }
      prevVvHeightRef.current = vv.height;
      if (isOpen) updateListPosition();
    };
    vv.addEventListener('resize', onVvResize);
    return () => vv.removeEventListener('resize', onVvResize);
  }, [isOpen, updateListPosition]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (result: CityResult) => {
    const label = getCityLabel(result);
    setQuery(label);
    setIsOpen(false);
    onChange(label, parseFloat(result.lat), parseFloat(result.lon));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            const next = e.target.value;
            setQuery(next);
            onDraftChange?.(next);
            // Очищаем выбор только при полном очищении инпута.
            // При обычном наборе родителю не передаём текст, чтобы поиск не
            // ломался из-за условия query===value (поиск должен зависеть от
            // расхождения query и value).
            if (!next.trim()) {
              onChange('');
              return;
            }
            if (!onDraftChange) onChange(next);
          }}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            onFocusInput?.(e.currentTarget);
            if (results.length > 0) {
              setIsOpen(true);
              updateListPosition();
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "w-full bg-card/50 backdrop-blur-sm border border-border rounded-xl",
            "text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50",
            "transition-all duration-300",
            "px-4 py-3.5 pl-11",
            className
          )}
        />
      </div>

      {typeof document !== 'undefined' &&
        isOpen &&
        results.length > 0 &&
        createPortal(
          <div
            ref={listRef}
            style={listStyle}
            className="bg-card border border-border rounded-xl shadow-xl shadow-black/50 overflow-hidden overscroll-contain"
          >
            {results.map((result, i) => (
              <button
                key={`${result.lat}-${result.lon}-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(result)}
                className={cn(
                  'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
                  'hover:bg-white/5 border-b border-white/5 last:border-0',
                  i === selectedIndex && 'bg-primary/10',
                )}
              >
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm text-foreground">{getCityLabel(result)}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
