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
 * Close any unclosed inline emphasis/bold markers at the trailing edge of an
 * in-progress block so react-markdown never receives a dangling token that
 * it would render as raw * or ** characters.
 *
 * Examples:
 *   "**Заголовок"          → "**Заголовок**"   (bold rendered correctly)
 *   "**Заголовок**"        → unchanged          (already balanced)
 *   "text ending with *"   → "text ending with" (trailing stripped)
 */
function closeUnclosedMarkers(text: string): string {
  // Strip any bare trailing marker characters (1–3 * or _).
  let s = text.replace(/[*_]{1,3}$/, '');

  // Balance ** (bold): odd count means one is unclosed → close it.
  const boldCount = (s.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 !== 0) s += '**';

  // Balance * (italic): count after removing all ** so they don't interfere.
  const withoutBold = s.replace(/\*\*/g, '');
  const italicCount = (withoutBold.match(/\*/g) ?? []).length;
  if (italicCount % 2 !== 0) s += '*';

  return s;
}

/**
 * A completed markdown block.
 *
 * Memoized so it never re-renders once mounted — the key guarantee behind
 * the performance model. Each instance plays a one-shot CSS fade-in on
 * first mount, giving the block-level reveal animation.
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
 * The in-progress (active) block at the tail of the stream.
 *
 * NOT memoized — intentionally re-renders on every content update so the
 * user sees text growing in real time. No animation since the content is
 * still changing. closeUnclosedMarkers() ensures no raw symbols appear.
 */
function ActiveBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}

export default function AstroMarkdown({ content, isStreaming = false }: AstroMarkdownProps) {
  // ── Non-streaming: render the entire content as a single markdown document ──
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
  // Split on "\n\n" (the markdown paragraph separator). Every segment *before*
  // the last one is definitively complete — it already has a \n\n after it and
  // the LLM will not go back to edit it. The last segment is the "active" block
  // currently being written.
  //
  // Visual model:
  //   complete blocks → CompletedBlock (memoized, fade-in animation, never
  //                     re-renders once mounted — O(1) per new chunk)
  //   active block    → ActiveBlock    (updates every SSE batch, no animation)
  //   cursor          → thin horizontal bar after the active block
  //
  const segments     = content.split('\n\n');
  const completeRaw  = segments.slice(0, -1).filter(s => s.trim());
  const activeText   = closeUnclosedMarkers(segments[segments.length - 1] ?? '');

  return (
    <div className="leading-[1.6]">
      {completeRaw.map((block, idx) => (
        <CompletedBlock key={idx} text={block} />
      ))}
      {activeText.trim() && <ActiveBlock text={activeText} />}
      <span className="streaming-cursor" aria-hidden />
    </div>
  );
}
