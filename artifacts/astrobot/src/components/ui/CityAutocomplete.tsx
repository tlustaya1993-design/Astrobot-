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
  // Tracks viewport height when keyboard is closed, to distinguish address-bar
  // hide (~56px growth on Android) from keyboard dismiss (200px+ growth).
  const baseViewportHeightRef = useRef<number>(
    typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : 0
  );
  // Prevents onBlur from closing the dropdown while the user is touching a result row.
  const isTouchingDropdownRef = useRef(false);

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
    const spaceBelow = Math.max(0, visibleH - rect.bottom - 8);
    const maxHeight = Math.min(220, Math.max(120, spaceBelow - 12));

    setListStyle({
      position: 'fixed',
      top: rect.bottom + 4,
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

  // Close dropdown when the keyboard is dismissed (viewport grows back to ~base height).
  // Uses 150 px threshold so that Android Chrome hiding its address bar (~56-70 px growth)
  // does NOT incorrectly close the dropdown — only a real keyboard dismissal does.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Update base height whenever the keyboard is clearly not open.
    if (vv.height > window.innerHeight * 0.75) {
      baseViewportHeightRef.current = vv.height;
    }
    prevVvHeightRef.current = vv.height;
    const onVvResize = () => {
      const prev = prevVvHeightRef.current ?? vv.height;
      const keyboardWasOpen = prev < baseViewportHeightRef.current - 100;
      if (keyboardWasOpen && vv.height > prev + 150) {
        setIsOpen(false);
      }
      prevVvHeightRef.current = vv.height;
      if (isOpen) updateListPosition();
    };
    vv.addEventListener('resize', onVvResize);
    return () => vv.removeEventListener('resize', onVvResize);
  }, [isOpen, updateListPosition]);

  useEffect(() => {
    function handleClickOutside(e: PointerEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setIsOpen(false);
    }
    // pointerdown fires reliably on both touch and mouse across all platforms.
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
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
            // Delay so that a tap on a result row (which sets isTouchingDropdownRef)
            // can cancel the close. Prevents premature close on Android touch devices.
            window.setTimeout(() => {
              if (!isTouchingDropdownRef.current) setIsOpen(false);
            }, 150);
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
            onTouchStart={() => { isTouchingDropdownRef.current = true; }}
            onTouchEnd={() => { window.setTimeout(() => { isTouchingDropdownRef.current = false; }, 300); }}
            onTouchCancel={() => { isTouchingDropdownRef.current = false; }}
            className="bg-card border border-border rounded-xl shadow-xl shadow-black/50 overflow-hidden overscroll-contain"
          >
            {results.map((result, i) => (
              <button
                key={`${result.lat}-${result.lon}-${i}`}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
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
