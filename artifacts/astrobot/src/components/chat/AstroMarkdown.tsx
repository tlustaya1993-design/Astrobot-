import React from 'react';
import ReactMarkdown from 'react-markdown';

const PLANETS_RU = [
  "Солнце","Луна","Меркурий","Венера","Марс","Юпитер","Сатурн","Уран","Нептун","Плутон",
  "Хирон","Лилит","Северный Узел","Южный Узел","Северный узел","Южный узел","Асцендент","МС","Часть Удачи",
];
const SIGNS_RU = [
  "Овен","Телец","Близнецы","Рак","Лев","Дева","Весы","Скорпион","Стрелец","Козерог","Водолей","Рыбы",
];
const ASPECTS_RU = [
  "соединение","оппозиция","трин","квадрат","секстиль","квинконс","полуквадрат","сесквиквадрат",
  "Соединение","Оппозиция","Трин","Квадрат","Секстиль","Квинконс","Полуквадрат","Сесквиквадрат",
];

function goldify(text: string): React.ReactNode[] {
  const allTerms = [...PLANETS_RU, ...SIGNS_RU];
  const aspectTerms = ASPECTS_RU;

  const planetPattern  = allTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const aspectPattern  = aspectTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const combined = `(${planetPattern})|(${aspectPattern})`;
  const re = new RegExp(combined, 'g');

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const isPlanet = !!m[1];
    const isAspect = !!m[2];
    parts.push(
      <span
        key={key++}
        className={
          isPlanet
            ? 'text-amber-400 font-semibold'
            : isAspect
            ? 'text-amber-300/80 italic'
            : ''
        }
        style={isPlanet ? { textShadow: '0 0 8px rgba(124,58,237,0.4)' } : undefined}
      >
        {m[0]}
      </span>
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
