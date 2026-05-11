import React, { memo } from 'react';
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
 *
 * "**Хирон в Близнецах"  →  "**Хирон в Близнецах**"  (rendered gold bold)
 * "**Хирон в Близнецах**" →  unchanged                 (already balanced)
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

/**
 * Completed markdown block.
 * Memoized — never re-renders or re-animates after first mount.
 * Stable key={idx} from the original segment index guarantees the cache hit.
 */
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
 * Active (in-progress) block at the tail of the stream.
 * NOT memoized — re-renders on every SSE batch (~30 ms).
 * closeUnclosedMarkers ensures no raw ** or * is ever visible.
 * Always rendered through ReactMarkdown so formatting is immediate.
 */
function ActiveBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}

export default function AstroMarkdown({ content, isStreaming = false }: AstroMarkdownProps) {
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
  //
  // Split on \n\n (markdown paragraph boundary).
  // All segments except the last are "complete" — the model won't edit them.
  // The last segment is the active tail, still being written.
  //
  // Visual model:
  //   CompletedBlock (React.memo, fade-in animation, immutable after mount)
  //   ActiveBlock    (live, updates every ~30 ms, rendered via ReactMarkdown)
  //   cursor         (blinking bar below active block)
  //
  // The active tail is ALWAYS rendered — not hidden behind a "hasBlocks" guard.
  // This prevents the "plain canvas" effect where the paragraph being typed
  // would disappear and then jump into a CompletedBlock on \n\n arrival.
  // closeUnclosedMarkers() ensures no raw markdown symbols are ever visible.
  const segments     = content.split('\n\n');
  const completeSegs = segments.slice(0, -1);
  const activeTail   = closeUnclosedMarkers(segments[segments.length - 1] ?? '');

  return (
    <div className="leading-[1.6]">
      {completeSegs.map((block, idx) =>
        block.trim() ? <CompletedBlock key={idx} text={block} /> : null
      )}
      {activeTail.trim() && <ActiveBlock text={activeTail} />}
      <span className="streaming-cursor" aria-hidden />
    </div>
  );
}
