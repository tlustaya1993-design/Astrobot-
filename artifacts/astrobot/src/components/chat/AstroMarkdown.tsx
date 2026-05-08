import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface AstroMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-4 last:mb-0 leading-[1.6]">{children}</p>,
  strong: ({ children }) => <strong className="text-primary font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-accent font-medium italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1.5">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-3 rounded-lg border border-white/10">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-primary/10 text-primary/90">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-white/5">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-white/3 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top">{children}</td>
  ),
};

export default function AstroMarkdown({ content, isStreaming = false }: AstroMarkdownProps) {
  const [showMarkdown, setShowMarkdown] = useState(!isStreaming);
  // Tracks how many chars were already rendered — used to isolate the fresh chunk
  const stableCountRef = useRef(isStreaming ? 0 : content.length);

  useEffect(() => {
    if (isStreaming) {
      setShowMarkdown(false);
      stableCountRef.current = 0;
    } else {
      // Small pause so the final chunk finishes its fade before markdown kicks in
      const t = setTimeout(() => {
        stableCountRef.current = 0;
        setShowMarkdown(true);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isStreaming]);

  // ── Streaming mode: plain text, animate only the new chunk ──────────────────
  if (!showMarkdown || isStreaming) {
    const stable = content.slice(0, stableCountRef.current);
    const fresh  = content.slice(stableCountRef.current);
    // Update ref after reading — intentional mutable-ref-in-render pattern
    stableCountRef.current = content.length;

    return (
      <div className="leading-[1.75] whitespace-pre-wrap break-words">
        <span>{stable}</span>
        {fresh && (
          <span className="stream-fade-in">{fresh}</span>
        )}
        {isStreaming && <span className="streaming-cursor" aria-hidden />}
      </div>
    );
  }

  // ── Post-stream: full markdown with a soft reveal ────────────────────────────
  return (
    <div className="leading-[1.6] stream-md-reveal">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
