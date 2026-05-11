import React, { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

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
 * Maintains a local `visIdx` that advances at ~220 chars/sec (≈ 4 chars
 * every 18 ms). This makes text flow smoothly from left to right as it is
 * generated — the user sees a continuous reveal, not sudden large chunks.
 *
 * When the parent's `text` prop grows faster than the reveal speed (burst
 * from the LLM), `visIdx` catches up gradually, which is the desired
 * typewriter-flow effect. When `text` stops growing (stream end), `visIdx`
 * reaches `text.length` and the interval clears itself.
 */
function ActiveBlock({ text }: { text: string }) {
  // How many characters of `text` are currently visible.
  const [visIdx, setVisIdx] = useState(0);
  // Always-fresh ref so the interval callback can read the latest text
  // without being stale-closed over an old value.
  const latestText = useRef(text);
  latestText.current = text;

  // Reveal ~4 chars per frame (≈ 16 ms tick → ~240 chars/sec ≈ 48 words/sec).
  // Fast enough that it doesn't look like character-by-character typing,
  // smooth enough that the left-to-right flow is perceptible.
  useEffect(() => {
    const id = setInterval(() => {
      setVisIdx(prev => Math.min(prev + 4, latestText.current.length));
    }, 16);
    return () => clearInterval(id);
  }, []); // start once on mount, self-clears via setVisIdx reaching target

  const displayText = closeUnclosedMarkers(text.slice(0, visIdx));

  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
      {displayText}
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
      <div className="leading-[1.6] stream-md-reveal">
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
  // ActiveBlock:    maintains a visIdx that advances 4 chars / 16 ms, giving
  //                 a smooth left-to-right text-flow effect.
  // StreamingDots:  three animated dots (same as pre-message typing indicator).
  const segments     = content.split('\n\n');
  const completeSegs = segments.slice(0, -1);
  const activeTail   = segments[segments.length - 1] ?? '';

  return (
    <div className="leading-[1.6]">
      {completeSegs.map((block, idx) =>
        block.trim() ? <CompletedBlock key={idx} text={block} /> : null
      )}
      {activeTail.trim() && <ActiveBlock text={activeTail} />}
      <StreamingDots />
    </div>
  );
});

export default AstroMarkdown;
