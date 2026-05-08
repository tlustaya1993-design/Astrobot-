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
 * A completed markdown block — memoized so it never re-renders or
 * re-animates after its initial mount. Stable key from the segment index
 * guarantees React.memo always hits the cache for existing blocks.
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
  // Split on \n\n. Segments before the last one are "complete" — the LLM has
  // already moved past them. The last segment is still being written and is
  // intentionally NOT rendered: blocks appear as whole units (block-reveal UX),
  // not word-by-word. When isStreaming flips false the full content renders.
  const segments    = content.split('\n\n');
  const completeSegs = segments.slice(0, -1);

  return (
    <div className="leading-[1.6]">
      {completeSegs.map((block, idx) =>
        block.trim() ? <CompletedBlock key={idx} text={block} /> : null
      )}
      <span className="streaming-cursor" aria-hidden />
    </div>
  );
}
