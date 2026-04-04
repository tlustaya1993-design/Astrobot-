import React from 'react';
import ReactMarkdown from 'react-markdown';

const KEY_PHRASES = [
  'самое важное',
  'ключевая мысль',
  'коротко',
  'в двух словах',
  'итог',
  'вывод',
  'что делать',
  'на что обратить внимание',
  'лучше сделать',
  'лучше не',
  'не делай',
  'сделай так',
  'риск',
  'сильная сторона',
  'слабое место',
  'главный фокус',
  'практический шаг',
];

function goldify(text: string): React.ReactNode[] {
  if (!text) return [text];

  const escaped = KEY_PHRASES
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp(`(${escaped})`, 'gi');

  const parts: React.ReactNode[] = [];
  let last = 0;
  let idx = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong
        key={`hl-${idx++}`}
        className="font-semibold text-amber-300"
        style={{ textShadow: '0 0 6px rgba(212,175,55,0.32)' }}
      >
        {m[0]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function processNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') {
    const result = goldify(node);
    if (result.length === 1 && typeof result[0] === 'string') return result[0];
    return <>{result}</>;
  }
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    const newChildren = React.Children.map(el.props.children, processNode);
    return React.cloneElement(el, {}, newChildren);
  }
  return node;
}

const GoldP = ({ children, ...props }: React.ComponentProps<'p'>) => (
  <p {...props}>{processNode(children as React.ReactNode)}</p>
);
const GoldLi = ({ children, ...props }: React.ComponentProps<'li'>) => (
  <li {...props}>{processNode(children as React.ReactNode)}</li>
);
const GoldTd = ({ children, ...props }: React.ComponentProps<'td'>) => (
  <td {...props}>{processNode(children as React.ReactNode)}</td>
);
const GoldStrong = ({ children, ...props }: React.ComponentProps<'strong'>) => (
  <strong {...props}>{processNode(children as React.ReactNode)}</strong>
);

interface AstroMarkdownProps { content: string }

export default function AstroMarkdown({ content }: AstroMarkdownProps) {
  return (
    <ReactMarkdown
      components={{
        p:      GoldP,
        li:     GoldLi,
        td:     GoldTd,
        strong: GoldStrong,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
