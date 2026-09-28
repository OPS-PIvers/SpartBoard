// LMS question HTML to plain text: one line per paragraph, list item or table row.

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'section',
  'article',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'caption',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
]);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** One cell's text on a single line. */
const cellText = (cell: Element): string =>
  readableText(cell)
    .replace(/\s*\n\s*/g, ' ')
    .trim();

function walk(node: Node, out: string[]): void {
  if (node.nodeType === TEXT_NODE) {
    out.push((node.textContent ?? '').replace(/\s+/g, ' '));
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style') return;
  if (tag === 'br') {
    out.push('\n');
    return;
  }
  if (tag === 'tr') {
    const cells = Array.from(el.children)
      .filter((c) => /^t[dh]$/i.test(c.tagName))
      .map(cellText)
      .filter(Boolean);
    if (cells.length > 0) out.push(`\n${cells.join(' | ')}\n`);
    return;
  }
  const block = BLOCK_TAGS.has(tag);
  if (tag === 'li') out.push('\n- ');
  else if (block) out.push('\n');
  for (const child of Array.from(el.childNodes)) walk(child, out);
  if (block || tag === 'li') out.push('\n');
}

/** The element's words, one line per paragraph, list item or table row. */
export function readableText(root: Node): string {
  const out: string[] = [];
  for (const child of Array.from(root.childNodes)) walk(child, out);
  return out
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
