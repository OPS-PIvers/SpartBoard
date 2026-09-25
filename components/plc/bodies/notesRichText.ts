// Markdown <-> editor DOM bridge for the rich PLC notes editor. Notes stay
// stored as Markdown; each Markdown line maps to one editor block.
import {
  BULLET_RE,
  CHECK_RE,
  ESCAPABLE_CHARS,
  HEADING_RE,
  ORDERED_RE,
  QUOTE_RE,
  tokenizeInline,
  type InlineToken,
} from './notesMarkdownGrammar';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function tokensToHtml(tokens: InlineToken[]): string {
  return tokens
    .map((tok) => {
      switch (tok.type) {
        case 'bold':
          return `<strong>${tokensToHtml(tok.children)}</strong>`;
        case 'italic':
          return `<em>${tokensToHtml(tok.children)}</em>`;
        case 'code':
          return `<code>${escapeHtml(tok.value)}</code>`;
        case 'text':
        default:
          return escapeHtml(tok.value);
      }
    })
    .join('');
}

function inlineHtml(text: string): string {
  const html = tokensToHtml(tokenizeInline(text));
  return html || '<br>';
}

export function markdownToEditorHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let openList: 'ul' | 'ol' | null = null;
  const switchList = (tag: 'ul' | 'ol' | null) => {
    if (openList === tag) return;
    if (openList) out.push(`</${openList}>`);
    if (tag) out.push(`<${tag}>`);
    openList = tag;
  };

  for (const line of lines) {
    if (line.trim() === '') {
      switchList(null);
      out.push('<p><br></p>');
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      switchList(null);
      const level = Math.min(heading[1].length, 3);
      out.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`);
      continue;
    }
    const check = CHECK_RE.exec(line);
    if (check) {
      switchList('ul');
      const checked = check[1].toLowerCase() === 'x';
      out.push(
        `<li data-checked="${checked ? 'true' : 'false'}">${inlineHtml(check[2])}</li>`
      );
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      switchList('ul');
      out.push(`<li>${inlineHtml(bullet[1])}</li>`);
      continue;
    }
    const ordered = ORDERED_RE.exec(line);
    if (ordered) {
      switchList('ol');
      out.push(`<li>${inlineHtml(ordered[1])}</li>`);
      continue;
    }
    const quote = QUOTE_RE.exec(line);
    if (quote) {
      switchList(null);
      out.push(`<blockquote>${inlineHtml(quote[1])}</blockquote>`);
      continue;
    }
    switchList(null);
    out.push(`<p>${inlineHtml(line)}</p>`);
  }
  switchList(null);
  return out.join('');
}

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
}

type Marks = Omit<Run, 'text'>;

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'PRE',
]);

function isBlock(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName);
}

function isBoldEl(el: HTMLElement): boolean {
  if (el.tagName === 'B' || el.tagName === 'STRONG') return true;
  const weight = el.style.fontWeight;
  return weight === 'bold' || Number(weight) >= 600;
}

function isItalicEl(el: HTMLElement): boolean {
  return (
    el.tagName === 'I' || el.tagName === 'EM' || el.style.fontStyle === 'italic'
  );
}

// Splits inline content into lines (at <br> and nested blocks) of marked runs.
function collectInlineLines(nodes: Node[]): Run[][] {
  const lines: Run[][] = [[]];
  const walk = (node: Node, marks: Marks) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.nodeValue ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\u200b\r]/g, '')
        .split('\n');
      parts.forEach((text, i) => {
        if (i > 0) lines.push([]);
        if (text) lines[lines.length - 1].push({ text, ...marks });
      });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      lines.push([]);
      return;
    }
    const next: Marks = {
      bold: marks.bold || isBoldEl(node),
      italic: marks.italic || isItalicEl(node),
      code: marks.code || node.tagName === 'CODE',
    };
    const block = isBlock(node);
    if (block && lines[lines.length - 1].length > 0) lines.push([]);
    node.childNodes.forEach((child) => walk(child, next));
    if (block && lines[lines.length - 1].length > 0) lines.push([]);
  };
  nodes.forEach((n) => walk(n, { bold: false, italic: false, code: false }));
  // A trailing <br> is the browser's placeholder, not a real line.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

function mergeRuns(runs: Run[]): Run[] {
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.bold === run.bold &&
      last.italic === run.italic &&
      last.code === run.code
    ) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

const ESCAPE_ALL_RE = /[\\`*_]/g;

function escapeText(text: string, all: boolean): string {
  if (all) return text.replace(ESCAPE_ALL_RE, (c) => `\\${c}`);
  // Only a backslash that would otherwise escape the next character.
  return text.replace(/\\(?=[\\`*_#>.\-+[\]])/g, '\\\\');
}

function runsToMarkdown(runs: Run[], escapeAll: boolean): string {
  return runs
    .map((run) => {
      if (run.code) {
        const code = run.text.replace(/`/g, '');
        return code ? `\`${code}\`` : '';
      }
      if (!run.bold && !run.italic) return escapeText(run.text, escapeAll);
      const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text);
      const [lead, core, trail] = match
        ? [match[1], match[2], match[3]]
        : ['', run.text, ''];
      if (!core) return run.text;
      const inner = escapeText(core, escapeAll);
      let wrapped = inner;
      if (run.bold && run.italic) wrapped = `**_${inner}_**`;
      else if (run.bold) wrapped = `**${inner}**`;
      else wrapped = `*${inner}*`;
      return `${lead}${wrapped}${trail}`;
    })
    .join('');
}

// Per-character mark signature (whitespace ignored) used to prove a
// serialized line parses back to what the editor shows.
function markSignature(runs: Run[]): string {
  let sig = '';
  for (const run of runs) {
    const mark = run.code
      ? 'c'
      : `${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}`;
    for (const ch of run.text) {
      if (/\s/.test(ch)) continue;
      sig += `${ch}\u0000${mark}\u0001`;
    }
  }
  return sig;
}

function tokensToRuns(tokens: InlineToken[], marks: Marks, out: Run[]): Run[] {
  for (const tok of tokens) {
    if (tok.type === 'text') out.push({ text: tok.value, ...marks });
    else if (tok.type === 'code')
      out.push({ text: tok.value, ...marks, code: true });
    else if (tok.type === 'bold')
      tokensToRuns(tok.children, { ...marks, bold: true }, out);
    else tokensToRuns(tok.children, { ...marks, italic: true }, out);
  }
  return out;
}

function inlineMarkdown(runs: Run[]): string {
  const merged = mergeRuns(
    runs.map((r) => (r.code ? { ...r, text: r.text.replace(/`/g, '') } : r))
  );
  const expected = markSignature(merged);
  const minimal = runsToMarkdown(merged, false);
  const parsed = tokensToRuns(
    tokenizeInline(minimal),
    { bold: false, italic: false, code: false },
    []
  );
  if (markSignature(parsed) === expected) return minimal;
  return runsToMarkdown(merged, true);
}

// Stops a paragraph or list item from re-parsing as a different block.
function escapeParagraphStart(md: string): string {
  if (HEADING_RE.test(md) || QUOTE_RE.test(md) || /^[-*]\s/.test(md)) {
    return ESCAPABLE_CHARS.includes(md[0]) ? `\\${md}` : md;
  }
  const ordered = /^(\d+)\.(\s)/.exec(md);
  if (ordered) return `${ordered[1]}\\.${md.slice(ordered[1].length + 1)}`;
  return md;
}

function escapeItemStart(md: string): string {
  return /^\[[ xX]\]\s/.test(md) ? `\\${md}` : md;
}

function linesOf(nodes: Node[]): string[] {
  return collectInlineLines(nodes).map(inlineMarkdown);
}

function serializeList(list: HTMLElement, out: string[]): void {
  const ordered = list.tagName === 'OL';
  let n = 0;
  list.childNodes.forEach((child) => {
    if (!(child instanceof HTMLElement)) return;
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      serializeList(child, out);
      return;
    }
    const inline: Node[] = [];
    const nested: HTMLElement[] = [];
    child.childNodes.forEach((c) => {
      if (
        c instanceof HTMLElement &&
        (c.tagName === 'UL' || c.tagName === 'OL')
      )
        nested.push(c);
      else inline.push(c);
    });
    const text = linesOf(inline).join(' ').trim();
    n += 1;
    let prefix = '- ';
    if (ordered) prefix = `${n}. `;
    else if (child.dataset.checked === 'true') prefix = '- [x] ';
    else if (child.dataset.checked === 'false') prefix = '- [ ] ';
    out.push(`${prefix}${escapeItemStart(text)}`);
    nested.forEach((l) => serializeList(l, out));
  });
}

function serializeChildren(container: Node, out: string[]): void {
  let inlineBuf: Node[] = [];
  const flushInline = () => {
    if (inlineBuf.length === 0) return;
    const hasText = inlineBuf.some(
      (n) => n.nodeType !== Node.TEXT_NODE || (n.nodeValue ?? '').trim() !== ''
    );
    if (hasText)
      linesOf(inlineBuf).forEach((l) => out.push(escapeParagraphStart(l)));
    inlineBuf = [];
  };
  container.childNodes.forEach((node) => {
    if (!isBlock(node)) {
      inlineBuf.push(node);
      return;
    }
    flushInline();
    const tag = node.tagName;
    if (tag === 'UL' || tag === 'OL') {
      serializeList(node, out);
    } else if (/^H[1-6]$/.test(tag)) {
      const level = Math.min(Number(tag[1]), 3);
      const text = linesOf([...node.childNodes])
        .join(' ')
        .trim();
      out.push(`${'#'.repeat(level)} ${text}`);
    } else if (tag === 'BLOCKQUOTE') {
      const inner: string[] = [];
      serializeChildren(node, inner);
      (inner.length ? inner : ['']).forEach((l) => out.push(`> ${l}`));
    } else if ([...node.childNodes].some(isBlock)) {
      serializeChildren(node, out);
    } else {
      linesOf([...node.childNodes]).forEach((l) =>
        out.push(escapeParagraphStart(l))
      );
    }
  });
  flushInline();
}

export function editorDomToMarkdown(root: HTMLElement): string {
  const out: string[] = [];
  serializeChildren(root, out);
  return out.join('\n');
}
