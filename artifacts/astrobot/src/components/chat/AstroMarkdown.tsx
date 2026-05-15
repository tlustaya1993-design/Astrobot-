import React, { memo, useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const REMARK_PLUGINS = [remarkGfm];

interface AstroMarkdownProps {
  content: string;
  isStreaming?: boolean;
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
 * Close any trailing unclosed inline markers so ReactMarkdown never receives
 * a dangling ** or * that would render as a raw symbol.
 */
function closeUnclosedMarkers(text: string): string {
  let s = text.replace(/[*_]{1,3}$/, '');
  const boldCount = (s.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 !== 0) s += '**';
  const withoutBold = s.replace(/\*\*/g, '');
  const italicCount = (withoutBold.match(/\*/g) ?? []).length;
  if (italicCount % 2 !== 0) s += '*';
  return s;
}

/** Completed markdown block — immutable after first mount. */
const CompletedBlock = memo(function CompletedBlock({ text }: { text: string }) {
  return (
    <div className="stream-block-reveal">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

/**
 * In-progress block at the tail of the stream.
 *
 * Uses requestAnimationFrame to reveal 5 chars per frame (~300 chars/sec at
 * 60 fps). The loop runs independently of the 30 ms batch timer so there is
 * no double-animation conflict. Formatting via ReactMarkdown is applied on
 * every frame, so bold/italic/headers appear correctly from the first char.
 *
 * The component is keyed by paragraph index in the parent so it remounts
 * cleanly for each new paragraph, resetting visibleLength to 0.
 */
function ActiveBlock({ text }: { text: string }) {
  const [visibleLength, setVisibleLength] = useState(0);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    setVisibleLength(0);
    // 5 chars every 50 ms = 100 chars/sec (3× slower than the previous 300 chars/sec)
    const timer = setInterval(() => {
      setVisibleLength(prev => {
        const target = textRef.current.length;
        if (prev >= target) return prev;
        return Math.min(prev + 5, target);
      });
    }, 50);
    return () => clearInterval(timer);
  }, []);

  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
      {closeUnclosedMarkers(text.slice(0, visibleLength))}
    </ReactMarkdown>
  );
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
const AstroMarkdown = memo(function AstroMarkdown({ content, isStreaming = false }: AstroMarkdownProps) {
  // ── Non-streaming: full static render ───────────────────────────────────────
  if (!isStreaming) {
    return (
      <div className="astro-md leading-[1.65] stream-md-reveal">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // ── Streaming path ───────────────────────────────────────────────────────────
  // Split on \n\n.  All segments except the last are "complete" — the model
  // won't edit them. The last segment is the active tail, still being written.
  //
  // CompletedBlock: React.memo + stable key → immutable, zero re-render cost.
  // ActiveBlock:    keyed by paragraph index so it remounts for each new
  //                 paragraph and resets its RAF-based reveal from char 0.
  // StreamingDots:  three animated dots (same as pre-message typing indicator).
  const segments        = content.split('\n\n');
  const completeSegs    = segments.slice(0, -1);
  const activeTail      = segments[segments.length - 1] ?? '';
  const activeParagraph = segments.length - 1;

  return (
    <div className="astro-md leading-[1.65]">
      {completeSegs.map((block, idx) =>
        block.trim() ? <CompletedBlock key={idx} text={block} /> : null
      )}
      {activeTail.trim() && <ActiveBlock key={activeParagraph} text={activeTail} />}
      <StreamingDots />
    </div>
  );
});

export default AstroMarkdown;
