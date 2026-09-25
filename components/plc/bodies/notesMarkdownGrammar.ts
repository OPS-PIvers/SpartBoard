// Shared inline/block grammar for PLC note Markdown (renderer and rich editor).

export type InlineToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: InlineToken[] }
  | { type: 'italic'; children: InlineToken[] }
  | { type: 'code'; value: string };

// Characters a backslash turns back into literal text.
export const ESCAPABLE_CHARS = '\\`*_#>.-+[]';

// Order matters: escapes first, then code (so `**` inside backticks stays
// literal), then bold (`**`/`__`), then italic (`*`/`_`).
const INLINE_RE =
  /(\\[\\`*_#>.\-+[\]])|(`[^`]+`)|(\*\*(?:\\.|[^*\\])+\*\*)|(__(?:\\.|[^_\\])+__)|(\*(?:\\.|[^*\\])+\*)|(_(?:\\.|[^_\\])+_)/g;

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last?.type === 'text') last.value += value;
    else tokens.push({ type: 'text', value });
  };
  const re = new RegExp(INLINE_RE.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) pushText(text.slice(lastIndex, match.index));
    const [, escaped, code, boldStar, boldUnder, italStar, italUnder] = match;
    if (escaped) {
      pushText(escaped.slice(1));
    } else if (code) {
      tokens.push({ type: 'code', value: code.slice(1, -1) });
    } else if (boldStar || boldUnder) {
      const inner = (boldStar ?? boldUnder).slice(2, -2);
      tokens.push({ type: 'bold', children: tokenizeInline(inner) });
    } else if (italStar || italUnder) {
      const inner = (italStar ?? italUnder).slice(1, -1);
      tokens.push({ type: 'italic', children: tokenizeInline(inner) });
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) pushText(text.slice(lastIndex));
  return tokens;
}

export const HEADING_RE = /^(#{1,3})\s+(.*)$/;
export const BULLET_RE = /^[-*]\s+(.*)$/;
export const CHECK_RE = /^[-*]\s+\[([ xX])\]\s+(.*)$/;
export const ORDERED_RE = /^\d+\.\s+(.*)$/;
export const QUOTE_RE = /^>\s?(.*)$/;
