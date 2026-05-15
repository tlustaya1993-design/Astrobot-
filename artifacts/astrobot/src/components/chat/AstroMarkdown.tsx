import React, { memo, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const REMARK_PLUGINS = [remarkGfm];

/** ~12 символов/с — ровное проявление слева направо. */
const REVEAL_MS_PER_CHAR = 85;

interface AstroMarkdownProps {
  content: string;
  isStreaming?: boolean;
  /** Каждый шаг reveal — для autoscroll в Chat. */
  onRevealProgress?: () => void;
}

/**
 * Returns true when a <p> node is an "astro evidence block":
 * the paragraph either starts with a bare ✦ string, or its
 * first child is an <em> element whose text begins with ✦.
 * Both patterns are used by the LLM:
 *   *✦ italic text*     → <p><em>✦ italic text</em></p>
 *   ✦ *italic text*     → <p>✦ <em>italic text</em></p>
 */
function isAstroEmBlock(children: React.ReactNode): boolean {
  const arr = React.Children.toArray(children);
  if (arr.length === 0) return false;
  const first = arr[0];
  if (typeof first === 'string' && first.trimStart().startsWith('✦')) return true;
  if (React.isValidElement(first)) {
    const el = first as React.ReactElement<{ children?: React.ReactNode }>;
    if (el.type === 'em') {
      const text = React.Children.toArray(el.props.children)
        .map(c => (typeof c === 'string' ? c : ''))
        .join('');
      return text.trimStart().startsWith('✦');
    }
  }
  return false;
}

const MD_COMPONENTS: Components = {
  p: ({ children }) => {
    if (isAstroEmBlock(children)) {
      return <p className="astro-em-block mb-3 last:mb-0">{children}</p>;
    }
    return <p className="mb-3 last:mb-0 leading-[1.65]">{children}</p>;
  },
  strong: ({ children }) => <strong className="text-primary font-semibold">{children}</strong>,
  em:     ({ children }) => <em className="text-accent font-medium italic">{children}</em>,
  h1:     ({ children }) => <h1 className="text-white font-semibold text-xl mb-3 mt-2 leading-snug">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-white font-semibold text-lg mb-3 mt-2 leading-snug">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-primary/90 font-semibold text-[12px] tracking-[0.08em] uppercase mb-2 mt-4 leading-snug">{children}</h3>,
  h4:     ({ children }) => <h4 className="text-primary/80 font-semibold text-[11px] tracking-[0.06em] uppercase mb-2 mt-3">{children}</h4>,
  h5:     ({ children }) => <h5 className="text-primary/70 font-semibold text-xs mb-1 mt-1">{children}</h5>,
  h6:     ({ children }) => <h6 className="text-primary/60 font-semibold text-xs mb-1 mt-1">{children}</h6>,
  ul:     ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-[1.65]">{children}</li>,
  hr:     ()              => (
    <div className="astro-divider" role="separator">
      <span className="astro-divider-symbol">✦</span>
    </div>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-white/10">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-primary/10 text-primary/90">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-white/5">{children}</tbody>,
  tr:    ({ children }) => <tr className="hover:bg-white/3 transition-colors">{children}</tr>,
  th:    ({ children }) => <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">{children}</th>,
  td:    ({ children }) => <td className="px-3 py-2 align-top">{children}</td>,
};

/**
 * Close any unclosed inline markers so ReactMarkdown never sees a dangling
 * ** or * that would render as a raw symbol.
 *
 * Does NOT strip trailing markers first — stripping caused a one-frame
 * flicker: when LLM emitted the opening `*` and visibleLength landed on it,
 * the strip removed it and italic disappeared for one tick.
 * Instead we simply add a closing marker when the count is odd.
 */
function closeUnclosedMarkers(text: string): string {
  let s = text;
  const boldCount = (s.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 !== 0) s += '**';
  const withoutBold = s.replace(/\*\*/g, '');
  const italicCount = (withoutBold.match(/\*/g) ?? []).length;
  if (italicCount % 2 !== 0) s += '*';
  return s;
}

/**
 * Медленно «проявляет» буфер SSE посимвольно.
 * Буфер (target) может обгонять visible — тогда текст догоняет плавно, без скачков.
 * Не делим на CompletedBlock/ActiveBlock: иначе при \n\n абзац целиком всплывает (ХУЯК).
 */
function useStreamingReveal(
  targetLength: number,
  active: boolean,
  onRevealProgress?: () => void,
) {
  const [visibleLength, setVisibleLength] = useState(0);
  const targetRef = useRef(targetLength);
  targetRef.current = targetLength;
  const onProgressRef = useRef(onRevealProgress);
  onProgressRef.current = onRevealProgress;
  const everActiveRef = useRef(false);

  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      setVisibleLength(0);
      everActiveRef.current = false;
    }
    wasActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    everActiveRef.current = true;
    let rafId = 0;
    let lastTick = 0;
    const step = (now: number) => {
      if (now - lastTick >= REVEAL_MS_PER_CHAR) {
        lastTick = now;
        setVisibleLength((prev) => {
          const target = targetRef.current;
          if (prev >= target) return prev;
          onProgressRef.current?.();
          return prev + 1;
        });
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  useEffect(() => {
    if (active || !everActiveRef.current) return;
    if (visibleLength >= targetLength) {
      everActiveRef.current = false;
    }
  }, [active, targetLength, visibleLength]);

  return visibleLength;
}

/** Three animated dots — same animation as the pre-message typing indicator. */
function StreamingDots() {
  return (
    <span className="streaming-dots not-prose" aria-hidden>
      <svg className="w-1.5 h-1.5 text-primary/70 typing-dot" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="5" />
      </svg>
      <svg className="w-1.5 h-1.5 text-primary/70 typing-dot" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="5" />
      </svg>
      <svg className="w-1.5 h-1.5 text-primary/70 typing-dot" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="5" />
      </svg>
    </span>
  );
}

// Wrap in React.memo so non-streaming historical messages don't re-render
// on every ~30 ms SSE commit during a streaming response.
const AstroMarkdown = memo(function AstroMarkdown({
  content,
  isStreaming = false,
  onRevealProgress,
}: AstroMarkdownProps) {
  const [postStream, setPostStream] = useState(false);
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    if (isStreaming) {
      setPostStream(false);
    } else if (wasStreamingRef.current) {
      setPostStream(true);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const revealActive = isStreaming || postStream;
  const visibleLength = useStreamingReveal(content.length, revealActive, onRevealProgress);

  useEffect(() => {
    if (!postStream) return;
    if (visibleLength >= content.length) {
      setPostStream(false);
    }
  }, [postStream, visibleLength, content.length]);

  if (!revealActive) {
    return (
      <div className="astro-md leading-[1.65] stream-md-reveal">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // Plain text while revealing: ReactMarkdown on every char reflows layout → «куски».
  const shown = content.slice(0, visibleLength);

  return (
    <div className="astro-md leading-[1.65]">
      {shown ? (
        <p className="whitespace-pre-wrap break-words mb-0 leading-[1.65] text-foreground/95">
          {shown}
        </p>
      ) : null}
      {isStreaming && <StreamingDots />}
    </div>
  );
});

export default AstroMarkdown;
