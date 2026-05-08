import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

/**
 * Max interval (ms) between markdown re-parses during streaming.
 * Caps parse frequency at ~20fps — imperceptible to the eye but noticeably
 * lighter on mobile GPUs compared to parsing every ~30ms SSE batch.
 */
const STREAM_THROTTLE_MS = 50;

/** Stable plugin array — avoids creating a new reference on every render. */
const REMARK_PLUGINS = [remarkGfm];

interface AstroMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const MD_COMPONENTS: Components = {
  p:      ({ children }) => <p className="mb-4 last:mb-0 leading-[1.6]">{children}</p>,
  strong: ({ children }) => <strong className="text-primary font-semibold">{children}</strong>,
  em:     ({ children }) => <em className="text-accent font-medium italic">{children}</em>,
  h1:     ({ children }) => <h1 className="text-primary font-semibold text-xl mb-3 mt-2 leading-snug">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-primary font-semibold text-lg mb-3 mt-2 leading-snug">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-primary font-semibold text-base mb-2 mt-2 leading-snug">{children}</h3>,
  h4:     ({ children }) => <h4 className="text-primary/90 font-semibold text-sm mb-2 mt-2">{children}</h4>,
  h5:     ({ children }) => <h5 className="text-primary/80 font-semibold text-sm mb-1 mt-1">{children}</h5>,
  h6:     ({ children }) => <h6 className="text-primary/70 font-semibold text-sm mb-1 mt-1">{children}</h6>,
  ul:     ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1.5">{children}</ol>,
  li:     ({ children }) => <li className="leading-[1.6]">{children}</li>,
  hr:     ()              => <hr className="border-white/10 my-4" />,
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
 * Strip trailing incomplete emphasis/bold markers so the parser never sees
 * an unclosed token that would render as raw symbols while the LLM is
 * mid-token (e.g. "**Заголовок" before the closing "**" has arrived).
 * The window where this matters is at most one ~30ms SSE batch.
 */
function sanitizeStreamingContent(text: string): string {
  return text.replace(/(\*{1,3}|_{1,3})$/, '');
}

export default function AstroMarkdown({ content, isStreaming = false }: AstroMarkdownProps) {
  // Throttled display content: React state that updates at most every
  // STREAM_THROTTLE_MS during streaming, immediately on stream end.
  // This decouples the markdown parse rate from the SSE batch rate.
  const [displayContent, setDisplayContent] = useState(content);

  const lastFlushRef  = useRef(performance.now());
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-fresh ref so the deferred timer callback uses the latest content,
  // not a stale closure captured at scheduling time.
  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  useEffect(() => {
    if (!isStreaming) {
      // Stream finished — flush immediately so the final text is complete.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setDisplayContent(content);
      return;
    }

    const now     = performance.now();
    const elapsed = now - lastFlushRef.current;

    if (elapsed >= STREAM_THROTTLE_MS) {
      // Enough time has passed — update right away.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      lastFlushRef.current = now;
      setDisplayContent(content);
    } else if (!timerRef.current) {
      // Schedule a flush for when the throttle window expires.
      // If more chunks arrive before the timer fires, the ref keeps them
      // without rescheduling — the timer will pick up the latest value.
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastFlushRef.current = performance.now();
        setDisplayContent(latestContentRef.current);
      }, STREAM_THROTTLE_MS - elapsed);
    }
  }, [content, isStreaming]);

  // Cleanup deferred timer on unmount.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const parseContent = isStreaming
    ? sanitizeStreamingContent(displayContent)
    : displayContent;

  // Memoize the ReactMarkdown output: re-parses only when parseContent changes
  // (throttled during streaming → at most ~20fps, not ~33fps).
  const renderedMarkdown = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
        {parseContent}
      </ReactMarkdown>
    ),
    [parseContent],
  );

  return (
    <div className="leading-[1.6]">
      {renderedMarkdown}
      {isStreaming && <span className="streaming-cursor" aria-hidden />}
    </div>
  );
}
