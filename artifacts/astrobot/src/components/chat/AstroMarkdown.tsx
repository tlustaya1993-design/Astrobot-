import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface AstroMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

const TABLE_COMPONENTS: Components = {
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

const STREAMING_COMPONENTS: Components = {
  ...TABLE_COMPONENTS,
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="text-primary font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-accent font-medium italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
};

export default function AstroMarkdown({ content, isStreaming = false }: AstroMarkdownProps) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={isStreaming ? STREAMING_COMPONENTS : TABLE_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="streaming-cursor" aria-hidden />}
    </div>
  );
}
