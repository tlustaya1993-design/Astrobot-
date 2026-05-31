import React, { memo, useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const REMARK_PLUGINS = [remarkGfm];

/** Paragraph source text starts with ✦ (with optional markdown asterisks). */
export function isLikelyAstroParagraphText(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('✦') || /^\*{1,2}\s*✦/.test(t);
}

/** Index in content where the ✦ evidence section begins, or content.length. */
export function findAstroSectionStart(content: string): number {
  const re = /^(\*{1,2}\s*)?✦/m;
  const match = re.exec(content);
  return match?.index ?? content.length;
}

/** Split assistant message into main interpretation and ✦ evidence sections. */
export function splitAtAstroBlock(content: string): { main: string; astro: string | null } {
  const cut = findAstroSectionStart(content);
  if (cut >= content.length) {
    return { main: content, astro: null };
  }
  const main = content.slice(0, cut).trimEnd();
  const astro = content.slice(cut).trimStart();
  return { main, astro: astro || null };
}

/**
 * Normalize main-body markdown so block headings render as gold lead strong:
 * - ### headings → **heading**
 * - **Title** — body on one line → title line + blank line + body
 */
export function normalizeMainSectionMarkdown(text: string): string {
  if (!text.trim()) return text;
  let out = text.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');
  out = out.replace(/^\*\*(.+?)\*\*\s*(?:[—–-]\s*)?(.+)$/gm, '**$1**\n\n$2');
  return out;
}

/** Reveal one line per tick (~12 lines/sec). */
const REVEAL_MS_PER_LINE = 80;

interface AstroMarkdownProps {
  content: string;
  isStreaming?: boolean;
  /** Каждый шаг reveal — для autoscroll в Chat. */
  onRevealProgress?: () => void;
}

function makeMdComponents(forceAstroBlock: boolean): Components {
  return {
    p: ({ children }) => {
      if (forceAstroBlock) {
        return (
          <p className="astro-em-block mb-3 last:mb-0" data-astro-block="true">
            {children}
          </p>
        );
      }
      return <p className="astro-md-main-block mb-3 last:mb-0 leading-[1.65]">{children}</p>;
    },
    strong: ({ children }) => (
      <strong className={forceAstroBlock ? 'font-semibold' : 'astro-md-strong-gold'}>{children}</strong>
    ),
    em:     ({ children }) => <em className="astro-md-em font-medium italic">{children}</em>,
    h1:     ({ children }) => <h1 className="text-white font-semibold text-xl mb-3 mt-2 leading-snug">{children}</h1>,
    h2:     ({ children }) => <h2 className="text-white font-semibold text-lg mb-3 mt-2 leading-snug">{children}</h2>,
    h3:     ({ children }) => (
      <h3 className="astro-md-strong-gold astro-md-block-heading text-[12px] tracking-[0.08em] uppercase mb-2 mt-4 leading-snug">
        {children}
      </h3>
    ),
    h4:     ({ children }) => (
      <h4 className="astro-md-strong-gold astro-md-block-heading text-[11px] tracking-[0.06em] uppercase mb-2 mt-3">
        {children}
      </h4>
    ),
    h5:     ({ children }) => <h5 className="text-primary/70 font-semibold text-xs mb-1 mt-1">{children}</h5>,
    h6:     ({ children }) => <h6 className="text-primary/60 font-semibold text-xs mb-1 mt-1">{children}</h6>,
    ul:     ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1.5">{children}</ul>,
    ol:     ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5">{children}</ol>,
    li:     ({ children }) => <li className="leading-[1.65]">{children}</li>,
    hr:     ()              => (
      <div className="astro-divider" role="separator">
        <span className="astro-divider-symbol">✦</span>
      </div>
    ),
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
}

const MAIN_MD_COMPONENTS = makeMdComponents(false);
const ASTRO_MD_COMPONENTS = makeMdComponents(true);

/**
 * Close any unclosed inline markers so ReactMarkdown never sees a dangling
 * ** or * that would render as a raw symbol.
 */
function closeUnclosedMarkers(text: string): string {
  const trailingWs = text.match(/(\s*)$/)?.[1] ?? '';
  let core = text.slice(0, text.length - trailingWs.length);

  const boldCount = (core.match(/\*\*/g) ?? []).length;
  if (boldCount % 2 !== 0) core += '**';

  const withoutBold = core.replace(/\*\*/g, '');
  const italicCount = (withoutBold.match(/\*/g) ?? []).length;
  if (italicCount % 2 !== 0) core += '*';

  return core + trailingWs;
}

type ParagraphRange = { start: number; end: number; text: string };

function paragraphRanges(content: string): ParagraphRange[] {
  if (!content) return [];
  const ranges: ParagraphRange[] = [];
  let i = 0;
  while (i <= content.length) {
    const next = content.indexOf('\n\n', i);
    if (next === -1) {
      ranges.push({ start: i, end: content.length, text: content.slice(i) });
      break;
    }
    ranges.push({ start: i, end: next, text: content.slice(i, next) });
    i = next + 2;
  }
  return ranges;
}

const ParagraphBlock = memo(function ParagraphBlock({
  text,
  active,
  forceAstroBlock,
}: {
  text: string;
  active: boolean;
  forceAstroBlock: boolean;
}) {
  const components = forceAstroBlock ? ASTRO_MD_COMPONENTS : MAIN_MD_COMPONENTS;
  const source = forceAstroBlock ? text : normalizeMainSectionMarkdown(text);
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {active ? closeUnclosedMarkers(source) : source}
    </ReactMarkdown>
  );
});

function StreamingMarkdownBody({
  content,
  visibleLength,
  astroSectionStart,
}: {
  content: string;
  visibleLength: number;
  astroSectionStart: number;
}) {
  const ranges = paragraphRanges(content);
  const nodes: React.ReactNode[] = [];

  for (let idx = 0; idx < ranges.length; idx++) {
    const { start, end, text } = ranges[idx];
    const forceAstroBlock = start >= astroSectionStart || isLikelyAstroParagraphText(text);
    if (visibleLength >= end) {
      if (text.length > 0) {
        nodes.push(
          <ParagraphBlock key={`p-${idx}`} text={text} active={false} forceAstroBlock={forceAstroBlock} />,
        );
      }
      continue;
    }
    if (visibleLength > start) {
      const partial = content.slice(start, visibleLength);
      if (partial.length > 0) {
        nodes.push(
          <ParagraphBlock key={`p-${idx}`} text={partial} active={true} forceAstroBlock={forceAstroBlock} />,
        );
      }
      break;
    }
    break;
  }

  return <>{nodes}</>;
}

function useStreamingReveal(
  content: string,
  active: boolean,
  onRevealProgress?: () => void,
) {
  const [visibleLength, setVisibleLength] = useState(0);
  const contentRef = useRef(content);
  contentRef.current = content;
  const onProgressRef = useRef(onRevealProgress);
  onProgressRef.current = onRevealProgress;
  const everActiveRef = useRef(false);

  const wasActiveRef = useRef(false);
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      setVisibleLength(0);
      everActiveRef.current = false;
    }
    wasActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!active) return;
    everActiveRef.current = true;
    let rafId = 0;
    let lastTick = 0;
    const step = (now: number) => {
      if (now - lastTick >= REVEAL_MS_PER_LINE) {
        lastTick = now;
        setVisibleLength((prev) => {
          const text = contentRef.current;
          if (prev >= text.length) return prev;
          const nl = text.indexOf('\n', prev);
          if (nl === -1) {
            onProgressRef.current?.();
            return text.length;
          }
          let next = nl + 1;
          while (next < text.length && text[next] === '\n') next++;
          onProgressRef.current?.();
          return next;
        });
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  useEffect(() => {
    if (active || !everActiveRef.current) return;
    if (visibleLength >= content.length) {
      everActiveRef.current = false;
    }
  }, [active, content.length, visibleLength]);

  return visibleLength;
}

function StreamingDots() {
  return (
    <span className="streaming-dots not-prose" aria-hidden>
      <svg className="w-1.5 h-1.5 text-primary/70 typing-dot" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="5" />
      </svg>
      <svg className="w-1.5 h-1.5 text-primary/70 typing-dot" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="5" />
      </svg>
      <svg className="w-1.5 h-1.5 text-primary/70 typing-dot" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="5" />
      </svg>
    </span>
  );
}

function StaticMarkdownBody({ content }: { content: string }) {
  const { main, astro } = useMemo(() => splitAtAstroBlock(content), [content]);
  const normalizedMain = useMemo(() => normalizeMainSectionMarkdown(main), [main]);

  return (
    <>
      {normalizedMain.trim().length > 0 && (
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MAIN_MD_COMPONENTS}>
          {normalizedMain}
        </ReactMarkdown>
      )}
      {astro && (
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={ASTRO_MD_COMPONENTS}>
          {astro}
        </ReactMarkdown>
      )}
    </>
  );
}

const AstroMarkdown = memo(function AstroMarkdown({
  content,
  isStreaming = false,
  onRevealProgress,
}: AstroMarkdownProps) {
  const [postStream, setPostStream] = useState(false);
  const wasStreamingRef = useRef(false);
  const astroSectionStart = useMemo(() => findAstroSectionStart(content), [content]);

  useEffect(() => {
    if (isStreaming) {
      setPostStream(false);
    } else if (wasStreamingRef.current) {
      setPostStream(true);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const revealActive = isStreaming || postStream;
  const visibleLength = useStreamingReveal(content, revealActive, onRevealProgress);

  useEffect(() => {
    if (!postStream) return;
    if (visibleLength >= content.length) {
      setPostStream(false);
    }
  }, [postStream, visibleLength, content.length]);

  if (!revealActive) {
    return (
      <div className="astro-md leading-[1.65] stream-md-reveal">
        <StaticMarkdownBody content={content} />
      </div>
    );
  }

  return (
    <div className="astro-md leading-[1.65]">
      <StreamingMarkdownBody
        content={content}
        visibleLength={visibleLength}
        astroSectionStart={astroSectionStart}
      />
      {isStreaming && <StreamingDots />}
    </div>
  );
});

export default AstroMarkdown;
