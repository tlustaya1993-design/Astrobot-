import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface AstroMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

// One component set for both streaming and non-streaming — prevents any visual switch at stream end
const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-[1.6]">{children}</p>,
  strong: ({ children }) => <strong className="text-primary font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-accent font-medium italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
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
  // After stream ends, briefly fade in so the cursor removal is gentle rather than abrupt
  const [fadedIn, setFadedIn] = useState(true);

  useEffect(() => {
    if (!isStreaming) {
      setFadedIn(false);
      const t = requestAnimationFrame(() => setFadedIn(true));
      return () => cancelAnimationFrame(t);
    }
  }, [isStreaming]);

  return (
    <div
      className="leading-[1.6]"
      style={!isStreaming ? { transition: 'opacity 0.12s ease-out', opacity: fadedIn ? 1 : 0.85 } : undefined}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="streaming-cursor" aria-hidden />}
    </div>
  );
}
