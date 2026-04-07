import React from 'react';
import ReactMarkdown from 'react-markdown';

interface AstroMarkdownProps { content: string }

export default function AstroMarkdown({ content }: AstroMarkdownProps) {
  return <ReactMarkdown>{content}</ReactMarkdown>;
}
