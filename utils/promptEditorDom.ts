// Converts a question prompt between its stored text marks and the rich prompt editor's DOM.
import {
  classifyPromptLine,
  markMayCloseBefore,
  markMayOpenAfter,
  parsePromptInline,
  PROMPT_MARK_JOINER,
  type PromptFormatNode,
  type PromptFormatTag,
} from './promptFormat';

const DOM_TAG: Record<PromptFormatTag, string> = { b: 'b', i: 'i', u: 'u' };
const MARK: Record<PromptFormatTag, string> = { b: '**', i: '*', u: '++' };

function appendInline(el: HTMLElement, nodes: PromptFormatNode[]): void {
  const doc = el.ownerDocument;
  for (const node of nodes) {
    if (typeof node === 'string') {
      const text = node.replaceAll(PROMPT_MARK_JOINER, '');
      if (text) el.appendChild(doc.createTextNode(text));
      continue;
    }
    const child = doc.createElement(DOM_TAG[node.tag]);
    appendInline(child, node.children);
    el.appendChild(child);
  }
}

function lineBlock(doc: Document, tag: 'p' | 'li', text: string): HTMLElement {
  const el = doc.createElement(tag);
  appendInline(el, parsePromptInline(text));
  if (!el.firstChild) el.appendChild(doc.createElement('br'));
  return el;
}

/** Replaces the editor's content with the prompt: one paragraph per line, list lines as lists. */
export function fillPromptEditor(root: HTMLElement, text: string): void {
  const doc = root.ownerDocument;
  root.replaceChildren();
  let list = null as HTMLElement | null;
  for (const raw of text.split('\n')) {
    const line = classifyPromptLine(raw);
    if (line.kind === 'text') {
      list = null;
      root.appendChild(lineBlock(doc, 'p', line.text));
      continue;
    }
    const tag = line.kind === 'bullet' ? 'UL' : 'OL';
    if (list?.tagName !== tag) {
      list = doc.createElement(tag.toLowerCase());
      if (line.kind === 'number' && line.n !== 1) {
        list.setAttribute('start', String(line.n));
      }
      root.appendChild(list);
    }
    list.appendChild(lineBlock(doc, 'li', line.text));
  }
}

function formatOf(el: HTMLElement): PromptFormatTag[] {
  const tags: PromptFormatTag[] = [];
  const name = el.tagName;
  const style = el.style;
  const weight = style?.fontWeight ?? '';
  if (
    name === 'B' ||
    name === 'STRONG' ||
    weight === 'bold' ||
    weight === 'bolder' ||
    Number(weight) >= 600
  ) {
    tags.push('b');
  }
  if (name === 'I' || name === 'EM' || style?.fontStyle === 'italic') {
    tags.push('i');
  }
  if (
    name === 'U' ||
    (style?.textDecoration ?? '').includes('underline') ||
    (style?.textDecorationLine ?? '').includes('underline')
  ) {
    tags.push('u');
  }
  return tags;
}

// Leading and trailing spaces sit outside the marks, which must hug the words they format.
function wrap(inner: string, mark: string): string {
  return inner
    .split('\n')
    .map((part) => {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(part);
      if (!m || !m[2]) return part;
      return `${m[1]}${mark}${m[2]}${mark}${m[3]}`;
    })
    .join('\n');
}

const BLOCK = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE']);

interface Piece {
  text: string;
  formatted: boolean;
}

// A mark beside a letter or another mark would not parse, so an invisible joiner goes between them.
function joinPieces(pieces: Piece[]): string {
  let out = '';
  let prevFormatted = false;
  for (const { text, formatted } of pieces) {
    if (!text) continue;
    const last = out[out.length - 1];
    const first = text[0];
    const isMark = (ch: string | undefined) => ch === '*' || ch === '+';
    const needs =
      out !== '' &&
      ((prevFormatted && isMark(last) && !markMayCloseBefore(first)) ||
        (formatted && isMark(first) && !markMayOpenAfter(last)));
    out += (needs ? PROMPT_MARK_JOINER : '') + text;
    prevFormatted = formatted;
  }
  return out;
}

function childPieces(
  parent: Node,
  active: ReadonlySet<PromptFormatTag>
): Piece[] {
  return Array.from(parent.childNodes).map((child) => ({
    text: inlineText(child, active),
    formatted:
      child instanceof HTMLElement &&
      formatOf(child).some((t) => !active.has(t)),
  }));
}

function inlineText(node: Node, active: ReadonlySet<PromptFormatTag>): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replaceAll(PROMPT_MARK_JOINER, '');
  }
  if (!(node instanceof HTMLElement)) return '';
  if (node.tagName === 'BR') return '\n';
  if (node.tagName === 'UL' || node.tagName === 'OL') {
    return `\n${listLines(node).join('\n')}`;
  }
  const own = formatOf(node).filter((t) => !active.has(t));
  const next = new Set([...active, ...own]);
  let inner = joinPieces(childPieces(node, next));
  if (BLOCK.has(node.tagName) && inner && !inner.startsWith('\n')) {
    inner = `\n${inner}`;
  }
  // Bold outermost, so bold-and-italic reads ***word***.
  for (const tag of ['i', 'u', 'b'] as const) {
    if (own.includes(tag)) inner = wrap(inner, MARK[tag]);
  }
  return inner;
}

function blockText(el: HTMLElement): string {
  const text = joinPieces(childPieces(el, new Set()));
  // A trailing <br> only keeps an empty block open; it is not a line of its own.
  return text.replace(/\n$/, '').replace(/^\n/, '');
}

function listLines(list: HTMLElement): string[] {
  const ordered = list.tagName === 'OL';
  let n = Number(list.getAttribute('start') ?? '1') || 1;
  const lines: string[] = [];
  for (const li of Array.from(list.children)) {
    if (!(li instanceof HTMLElement)) continue;
    const [first = '', ...rest] = blockText(li).split('\n');
    lines.push(`${ordered ? `${n}. ` : '• '}${first}`, ...rest);
    n += 1;
  }
  return lines;
}

// Joins neighbouring runs with the same format, so <b>a</b><b>b</b> saves as **ab**.
function mergeRuns(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll('b, strong, i, em, u'))) {
    const prev = el.previousSibling;
    if (
      prev instanceof HTMLElement &&
      prev.tagName === el.tagName &&
      prev.attributes.length === 0 &&
      el.attributes.length === 0
    ) {
      while (el.firstChild) prev.appendChild(el.firstChild);
      el.remove();
    }
  }
}

/** The editor's content as prompt text with bold, italic, underline and list marks. */
export function readPromptEditor(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  mergeRuns(copy);
  const lines: string[] = [];
  let loose = '';
  const flush = () => {
    if (loose) lines.push(...loose.split('\n'));
    loose = '';
  };
  copy.childNodes.forEach((child) => {
    if (
      child instanceof HTMLElement &&
      (child.tagName === 'UL' || child.tagName === 'OL')
    ) {
      flush();
      lines.push(...listLines(child));
    } else if (child instanceof HTMLElement && BLOCK.has(child.tagName)) {
      flush();
      lines.push(...blockText(child).split('\n'));
    } else {
      loose += inlineText(child, new Set());
    }
  });
  flush();
  return lines.join('\n');
}
