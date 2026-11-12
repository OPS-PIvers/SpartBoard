// Prompt formatting is stored as plain text marks: **bold**, *italic*, ++underline++, and "• " or "1. " list lines.
export type PromptFormatTag = 'b' | 'i' | 'u';
export type PromptFormatNode =
  string | { tag: PromptFormatTag; children: PromptFormatNode[] };

export type PromptLine =
  | { kind: 'text'; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'number'; n: number; text: string };

export const PROMPT_BULLET = '• ';
const BULLET_RE = /^• (.*)$/;
const NUMBER_RE = /^(\d{1,3})\. (.*)$/;
const MARKS: { mark: string; tags: PromptFormatTag[] }[] = [
  { mark: '***', tags: ['b', 'i'] },
  { mark: '**', tags: ['b'] },
  { mark: '++', tags: ['u'] },
  { mark: '*', tags: ['i'] },
];

const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
const isSpace = (ch: string | undefined) => !ch || /\s/.test(ch);

/** Cheap test for any formatting mark, so plain prompts skip parsing. */
export const mayHavePromptFormat = (text: string): boolean =>
  /\*|\+\+|^• |^\d{1,3}\. /m.test(text);

// Single * never opens or closes inside a word, so 3*x*y stays multiplication.
const intraword = (mark: string) => mark !== '*';

const canOpen = (s: string, i: number, from: number, mark: string) => {
  const next = s[i + mark.length];
  const prev = i > from ? s[i - 1] : undefined;
  return (
    !isSpace(next) &&
    next !== mark[0] &&
    prev !== mark[0] &&
    (intraword(mark) || !isWord(prev))
  );
};

function findClose(s: string, from: number, to: number, mark: string): number {
  for (let k = from; k <= to - mark.length; k++) {
    if (s[k] === '⟦') {
      const end = s.indexOf('⟧', k);
      if (end !== -1 && end < to) {
        k = end;
        continue;
      }
    }
    const after = k + mark.length < to ? s[k + mark.length] : undefined;
    if (
      k > from &&
      s.startsWith(mark, k) &&
      !isSpace(s[k - 1]) &&
      (intraword(mark) || !isWord(after)) &&
      after !== mark[0]
    ) {
      return k;
    }
  }
  return -1;
}

function parseRange(s: string, from: number, to: number): PromptFormatNode[] {
  const out: PromptFormatNode[] = [];
  let buf = '';
  let i = from;
  while (i < to) {
    if (s[i] === '⟦') {
      const end = s.indexOf('⟧', i);
      if (end !== -1 && end < to) {
        buf += s.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    let matched = false;
    for (const { mark, tags } of MARKS) {
      if (!s.startsWith(mark, i) || !canOpen(s, i, from, mark)) continue;
      const close = findClose(s, i + mark.length, to, mark);
      if (close === -1) continue;
      if (buf) out.push(buf);
      buf = '';
      let node: PromptFormatNode[] = parseRange(s, i + mark.length, close);
      for (const tag of [...tags].reverse()) node = [{ tag, children: node }];
      out.push(...node);
      i = close + mark.length;
      matched = true;
      break;
    }
    if (!matched) {
      buf += s[i];
      i++;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Bold, italic and underline runs in one line; ⟦equations⟧ are never split. */
export const parsePromptInline = (line: string): PromptFormatNode[] =>
  parseRange(line, 0, line.length);

export function classifyPromptLine(line: string): PromptLine {
  const bullet = BULLET_RE.exec(line);
  if (bullet) return { kind: 'bullet', text: bullet[1] ?? '' };
  const num = NUMBER_RE.exec(line);
  if (num) return { kind: 'number', n: Number(num[1]), text: num[2] ?? '' };
  return { kind: 'text', text: line };
}

export const hasPromptList = (text: string): boolean =>
  /^(?:• |\d{1,3}\. )/m.test(text);

const flatten = (nodes: PromptFormatNode[]): string =>
  nodes.map((n) => (typeof n === 'string' ? n : flatten(n.children))).join('');

/** The prompt without bold, italic or underline marks; list lines keep their bullet or number. */
export function stripPromptFormat(text: string): string {
  if (!/\*|\+\+/.test(text)) return text;
  return text
    .split('\n')
    .map((line) => flatten(parsePromptInline(line)))
    .join('\n');
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const HTML_TAG: Record<PromptFormatTag, string> = {
  b: 'strong',
  i: 'em',
  u: 'u',
};

const nodesToHtml = (
  nodes: PromptFormatNode[],
  leaf: (s: string) => string
): string =>
  nodes
    .map((n) =>
      typeof n === 'string'
        ? leaf(n)
        : `<${HTML_TAG[n.tag]}>${nodesToHtml(n.children, leaf)}</${HTML_TAG[n.tag]}>`
    )
    .join('');

/** Escaped HTML for print: marks become strong/em/u, newlines stay newlines; `leaf` turns plain runs into text. */
export function promptFormatHtml(
  text: string,
  leaf: (s: string) => string = (s) => s
): string {
  return text
    .split('\n')
    .map((line) =>
      nodesToHtml(parsePromptInline(line), (s) => escapeHtml(leaf(s)))
    )
    .join('\n');
}
