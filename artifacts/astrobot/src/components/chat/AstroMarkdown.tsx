import React, { memo, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const REMARK_PLUGINS = [remarkGfm];

/** Reveal one line per tick (~12 lines/sec). */
const REVEAL_MS_PER_LINE = 80;

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
  em:     ({ children }) => <em className="text-primary/90 font-medium italic">{children}</em>,
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
 * Closing markers are inserted BEFORE trailing whitespace, not after.
 * CommonMark forbids a closing delimiter preceded by Unicode whitespace, so
 * appending `*` after a trailing space makes the em element vanish for one
 * frame and reappear on the next non-space character — visible flicker.
 * By inserting before the whitespace the <em> DOM node is always present
 * once the opening `*` appears; only its text content updates each tick.
 */
function closeUnclosedMarkers(text: string): string {
  const trailingWs = text.match(/(\s*)$/)?.[1] ?? '';
  let core = text.slice(0, text.length - trailingWs.length);

  const boldCount = (core.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 !== 0) core += '**';

  const withoutBold = core.replace(/\*\*/g, '');
  const italicCount = (withoutBold.match(/\*/g) ?? []).length;
  if (italicCount % 2 !== 0) core += '*';

  return core + trailingWs;
}

type ParagraphRange = { start: number; end: number; text: string };

function paragraphRanges(content: string): ParagraphRange[] {
  if (!content) return [];
  const ranges: ParagraphRange[] = [];
  let i = 0;
  while (i <= content.length) {
    const next = content.indexOf('\n\n', i);
    if (next === -1) {
      ranges.push({ start: i, end: content.length, text: content.slice(i) });
      break;
    }
    ranges.push({ start: i, end: next, text: content.slice(i, next) });
    i = next + 2;
  }
  return ranges;
}

/**
 * Single paragraph renderer used for both in-progress and completed paragraphs.
 * Using the same component type + stable key `p-{idx}` means React reuses the
 * existing DOM nodes when the paragraph transitions from partial → complete,
 * instead of unmounting ActiveBlock and mounting CompletedBlock (which caused
 * a brief repaint flash at every paragraph boundary).
 */
const ParagraphBlock = memo(function ParagraphBlock({
  text,
  active,
}: {
  text: string;
  active: boolean;
}) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
      {active ? closeUnclosedMarkers(text) : text}
    </ReactMarkdown>
  );
});

function StreamingMarkdownBody({
  content,
  visibleLength,
}: {
  content: string;
  visibleLength: number;
}) {
  const ranges = paragraphRanges(content);
  const nodes: React.ReactNode[] = [];

  for (let idx = 0; idx < ranges.length; idx++) {
    const { start, end, text } = ranges[idx];
    if (visibleLength >= end) {
      if (text.length > 0) {
        nodes.push(<ParagraphBlock key={`p-${idx}`} text={text} active={false} />);
      }
      continue;
    }
    if (visibleLength > start) {
      const partial = content.slice(start, visibleLength);
      if (partial.length > 0) {
        nodes.push(<ParagraphBlock key={`p-${idx}`} text={partial} active={true} />);
      }
      break;
    }
    break;
  }

  return <>{nodes}</>;
}

/**
 * Reveals buffered SSE content line-by-line (one \n boundary per tick).
 * Consecutive blank lines are skipped in a single tick so paragraph
 * transitions don't stall. If no newline exists yet in the buffer the
 * rest of the incomplete line is shown immediately (no flicker: the
 * incomplete tail is still passed through closeUnclosedMarkers).
 */
function useStreamingReveal(
  content: string,
  active: boolean,
  onRevealProgress?: () => void,
) {
  const [visibleLength, setVisibleLength] = useState(0);
  const contentRef = useRef(content);
  contentRef.current = content;
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
      if (now - lastTick >= REVEAL_MS_PER_LINE) {
        lastTick = now;
        setVisibleLength((prev) => {
          const text = contentRef.current;
          if (prev >= text.length) return prev;
          const nl = text.indexOf('\n', prev);
          if (nl === -1) {
            // No complete line yet — show the rest of the incomplete tail.
            onProgressRef.current?.();
            return text.length;
          }
          let next = nl + 1;
          // Skip consecutive blank lines so \n\n paragraph gaps cross in one tick.
          while (next < text.length && text[next] === '\n') next++;
          onProgressRef.current?.();
          return next;
        });
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  useEffect(() => {
    if (active || !everActiveRef.current) return;
    if (visibleLength >= content.length) {
      everActiveRef.current = false;
    }
  }, [active, content.length, visibleLength]);

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
  const visibleLength = useStreamingReveal(content, revealActive, onRevealProgress);

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

  return (
    <div className="astro-md leading-[1.65]">
      <StreamingMarkdownBody content={content} visibleLength={visibleLength} />
      {isStreaming && <StreamingDots />}
    </div>
  );
});

export default AstroMarkdown;
