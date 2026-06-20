import React from 'react';

/**
 * Minimal, dependency-free, XSS-safe markdown renderer for PLC notes
 * (Decision 2.5b — "a small safe renderer … no new heavy dep").
 *
 * It returns React elements (never `dangerouslySetInnerHTML`), so user text is
 * always escaped by React. Supported block grammar — deliberately small,
 * matching the agenda → decisions → action-items meeting template:
 *
 *   # / ## / ### heading        → <h1>/<h2>/<h3>
 *   - item  /  * item           → bulleted list
 *   1. item                     → numbered list
 *   - [ ] item  /  - [x] item   → checklist (read-only checkbox glyph)
 *   > quote                     → blockquote
 *   plain line                  → paragraph
 *   blank line                  → paragraph break
 *
 * Inline grammar inside any block text:
 *   **bold**  __bold__          → <strong>
 *   *italic*  _italic_          → <em>
 *   `code`                      → <code>
 *
 * Unsupported syntax (images, raw HTML, links) is rendered as literal text —
 * there is no URL handling at all, so there is no anchor-injection surface.
 */

type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'code'; value: string };

// Order matters: code first (so `**` inside backticks stays literal), then
// bold (greedy `**`/`__`), then italic (`*`/`_`). Each alternative captures its
// inner text in a single group.
const INLINE_RE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)/g;

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const [, code, boldStar, boldUnder, italStar, italUnder] = match;
    if (code) {
      tokens.push({ type: 'code', value: code.slice(1, -1) });
    } else if (boldStar) {
      tokens.push({ type: 'bold', value: boldStar.slice(2, -2) });
    } else if (boldUnder) {
      tokens.push({ type: 'bold', value: boldUnder.slice(2, -2) });
    } else if (italStar) {
      tokens.push({ type: 'italic', value: italStar.slice(1, -1) });
    } else if (italUnder) {
      tokens.push({ type: 'italic', value: italUnder.slice(1, -1) });
    }
    lastIndex = INLINE_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return tokens;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return tokenizeInline(text).map((tok, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (tok.type) {
      case 'bold':
        return <strong key={key}>{tok.value}</strong>;
      case 'italic':
        return <em key={key}>{tok.value}</em>;
      case 'code':
        return (
          <code
            key={key}
            className="px-1 py-0.5 rounded bg-slate-100 text-[0.85em] font-mono text-slate-700"
          >
            {tok.value}
          </code>
        );
      case 'text':
      default:
        return <React.Fragment key={key}>{tok.value}</React.Fragment>;
    }
  });
}

interface BlockBullet {
  type: 'bullet';
  items: Array<{ text: string; checked: boolean | null }>;
}
interface BlockOrdered {
  type: 'ordered';
  items: string[];
}
interface BlockHeading {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
}
interface BlockQuote {
  type: 'quote';
  text: string;
}
interface BlockParagraph {
  type: 'paragraph';
  text: string;
}

type Block =
  | BlockBullet
  | BlockOrdered
  | BlockHeading
  | BlockQuote
  | BlockParagraph;

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const CHECK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/;
const ORDERED_RE = /^\d+\.\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

/** Parse the markdown body into a flat list of blocks. */
function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let bulletBuf: BlockBullet | null = null;
  let orderedBuf: BlockOrdered | null = null;
  let paragraphBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraphBuf.join(' ') });
      paragraphBuf = [];
    }
  };
  const flushBullet = () => {
    if (bulletBuf) {
      blocks.push(bulletBuf);
      bulletBuf = null;
    }
  };
  const flushOrdered = () => {
    if (orderedBuf) {
      blocks.push(orderedBuf);
      orderedBuf = null;
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushBullet();
    flushOrdered();
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flushAll();
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, text: heading[2] });
      continue;
    }

    const check = CHECK_RE.exec(line);
    if (check) {
      flushParagraph();
      flushOrdered();
      bulletBuf ??= { type: 'bullet', items: [] };
      bulletBuf.items.push({
        text: check[2],
        checked: check[1].toLowerCase() === 'x',
      });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flushParagraph();
      flushOrdered();
      bulletBuf ??= { type: 'bullet', items: [] };
      bulletBuf.items.push({ text: bullet[1], checked: null });
      continue;
    }

    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      flushParagraph();
      flushBullet();
      orderedBuf ??= { type: 'ordered', items: [] };
      orderedBuf.items.push(ordered[1]);
      continue;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      flushAll();
      blocks.push({ type: 'quote', text: quote[1] });
      continue;
    }

    // Plain text — accumulate into the current paragraph (soft-wrapped lines
    // join with a space).
    flushBullet();
    flushOrdered();
    paragraphBuf.push(line.trim());
  }

  flushAll();
  return blocks;
}

interface NotesMarkdownProps {
  body: string;
}

/**
 * Render PLC note markdown as escaped React nodes. Returns `null` for an empty
 * body so callers can show their own empty-state.
 */
export const NotesMarkdown: React.FC<NotesMarkdownProps> = ({ body }) => {
  const blocks = React.useMemo(() => parseBlocks(body), [body]);
  if (blocks.length === 0) return null;

  return (
    <div className="text-sm text-slate-700 leading-relaxed space-y-3">
      {blocks.map((block, i) => {
        const key = `b-${i}`;
        switch (block.type) {
          case 'heading': {
            if (block.level === 1) {
              return (
                <h2 key={key} className="text-lg font-bold text-slate-900 mt-1">
                  {renderInline(block.text, key)}
                </h2>
              );
            }
            if (block.level === 2) {
              return (
                <h3
                  key={key}
                  className="text-base font-bold text-slate-800 mt-1"
                >
                  {renderInline(block.text, key)}
                </h3>
              );
            }
            return (
              <h4
                key={key}
                className="text-sm font-bold uppercase tracking-wide text-slate-600 mt-1"
              >
                {renderInline(block.text, key)}
              </h4>
            );
          }
          case 'bullet':
            return (
              <ul key={key} className="list-none space-y-1">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="flex items-start gap-2">
                    {item.checked === null ? (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          item.checked
                            ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                            : 'border-slate-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    )}
                    <span
                      className={
                        item.checked ? 'line-through text-slate-400' : undefined
                      }
                    >
                      {renderInline(item.text, `${key}-${j}`)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          case 'ordered':
            return (
              <ol
                key={key}
                className="list-decimal list-inside space-y-1 marker:text-slate-400"
              >
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>
                    {renderInline(item, `${key}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote
                key={key}
                className="border-l-2 border-slate-300 pl-3 italic text-slate-600"
              >
                {renderInline(block.text, key)}
              </blockquote>
            );
          case 'paragraph':
          default:
            return <p key={key}>{renderInline(block.text, key)}</p>;
        }
      })}
    </div>
  );
};
