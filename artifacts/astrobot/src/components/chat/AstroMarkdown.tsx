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
  const sentenceParts = text.split(/([.!?]+(?:\s+|$))/);
  const highlightSentences: React.ReactNode[] = [];
  const sentenceRegex = /(важно|главное|ключ|итог|вывод|лучше|стоит|риск|внимание|фокус|совет|сейчас|сегодня|завтра|на практике|чтобы|поэтому)/i;
  const keyPhraseRegex = /(самое важное|коротко|в двух словах|ключевая мысль|что делать|на что обратить внимание|лучше сделать|не делай|сделай так)/i;
  let idx = 0;

  for (let i = 0; i < sentenceParts.length; i += 2) {
    const sentence = sentenceParts[i] ?? '';
    const punct = sentenceParts[i + 1] ?? '';
    const full = `${sentence}${punct}`;
    if (!full) continue;
    const shouldHighlight = keyPhraseRegex.test(full) || sentenceRegex.test(full);
    if (shouldHighlight) {
      highlightSentences.push(
        <span
          key={`hl-${idx++}`}
          className="text-amber-300 font-medium"
          style={{ textShadow: '0 0 6px rgba(212,175,55,0.32)' }}
        >
          {full}
        </span>,
      );
    } else {
      highlightSentences.push(full);
    }
  }

  return highlightSentences;
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
