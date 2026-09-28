/**
 * Reads an OpenDocument text file (.odt, from LibreOffice or a Word/Docs
 * "Save as ODT") into the same lines and pictures the Word reader produces,
 * so the question parser never learns which one ran.
 *
 * An .odt is a zip: `content.xml` holds the text and its automatic styles,
 * `styles.xml` the named ones, and pictures sit in the archive at the path a
 * `draw:image` points at. Bold, underline and highlight come from the styles
 * a span or paragraph names, which is how a teacher marks the right answer.
 */

import JSZip from 'jszip';
import { formatNumber } from './docxNumbering';
import type { DocLine, DocSegment, ExtractedImage } from './types';

const CONTENT_PATH = 'content.xml';
const STYLES_PATH = 'styles.xml';

/** Extensions Quiz can show as an image stimulus. */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export interface OdtContent {
  lines: DocLine[];
  images: ExtractedImage[];
}

const localName = (el: Element): string =>
  el.tagName.includes(':') ? el.tagName.split(':')[1] : el.tagName;

/** An attribute by its prefixed name, falling back to the bare local name. */
const attr = (el: Element, name: string): string | null =>
  el.getAttribute(name) ?? el.getAttribute(name.split(':')[1] ?? name);

const childrenNamed = (el: Element, name: string): Element[] =>
  Array.from(el.children).filter((c) => localName(c) === name);

const extensionOf = (path: string): string =>
  path.split('.').pop()?.toLowerCase() ?? '';

interface StyleInfo {
  parent?: string;
  emphasized: boolean;
}

/** Text properties a teacher uses to mark an answer. */
function propsEmphasized(props: Element | undefined): boolean {
  if (!props) return false;
  const weight = attr(props, 'fo:font-weight');
  if (weight && (weight === 'bold' || Number(weight) >= 600)) return true;
  const underline = attr(props, 'style:text-underline-style');
  if (underline && underline !== 'none') return true;
  const background = attr(props, 'fo:background-color');
  return Boolean(
    background &&
    background !== 'transparent' &&
    background.toLowerCase() !== '#ffffff'
  );
}

interface ListLevel {
  format: string;
  prefix: string;
  suffix: string;
  start: number;
}

/** ODF's `style:num-format` in the names `formatNumber` takes; null prints nothing. */
function numberFormat(format: string | null): string | null {
  switch (format) {
    case '1':
      return 'decimal';
    case 'a':
      return 'lowerLetter';
    case 'A':
      return 'upperLetter';
    case 'i':
      return 'lowerRoman';
    case 'I':
      return 'upperRoman';
    default:
      return null;
  }
}

/** Every named and automatic style and list style across both XML parts. */
class OdtStyles {
  private readonly styles = new Map<string, StyleInfo>();
  private readonly lists = new Map<string, Map<number, ListLevel>>();

  constructor(docs: readonly Document[]) {
    for (const doc of docs) {
      for (const el of Array.from(doc.getElementsByTagName('*'))) {
        const name = localName(el);
        if (name === 'style') this.addStyle(el);
        else if (name === 'list-style') this.addList(el);
      }
    }
  }

  private addStyle(el: Element): void {
    const name = attr(el, 'style:name');
    if (!name) return;
    const props = childrenNamed(el, 'text-properties')[0];
    this.styles.set(name, {
      ...(attr(el, 'style:parent-style-name')
        ? { parent: attr(el, 'style:parent-style-name') ?? undefined }
        : {}),
      emphasized: propsEmphasized(props),
    });
  }

  private addList(el: Element): void {
    const name = attr(el, 'style:name');
    if (!name) return;
    const levels = new Map<number, ListLevel>();
    for (const level of childrenNamed(el, 'list-level-style-number')) {
      const format = numberFormat(attr(level, 'style:num-format'));
      if (!format) continue;
      levels.set(Number(attr(level, 'text:level') ?? '1'), {
        format,
        prefix: attr(level, 'style:num-prefix') ?? '',
        suffix: attr(level, 'style:num-suffix') ?? '',
        start: Number(attr(level, 'text:start-value') ?? '1') || 1,
      });
    }
    this.lists.set(name, levels);
  }

  /** Whether a style, or one it inherits from, marks its text. */
  emphasized(name: string | null): boolean {
    const seen = new Set<string>();
    let current = name;
    while (current && !seen.has(current)) {
      seen.add(current);
      const style = this.styles.get(current);
      if (!style) return false;
      if (style.emphasized) return true;
      current = style.parent ?? null;
    }
    return false;
  }

  listLevel(listStyle: string, level: number): ListLevel | undefined {
    return this.lists.get(listStyle)?.get(level);
  }
}

/** Counts list items per list style, so a continued list keeps counting. */
class ListCounters {
  private readonly counts = new Map<string, number[]>();

  constructor(private readonly styles: OdtStyles) {}

  reset(listStyle: string): void {
    this.counts.set(listStyle, []);
  }

  /** The printed prefix for the next item at this depth, or '' for a bullet. */
  next(listStyle: string, depth: number, startOverride?: number): string {
    const levels = this.counts.get(listStyle) ?? [];
    this.counts.set(listStyle, levels);
    const level = this.styles.listLevel(listStyle, depth);
    const start = level?.start ?? 1;
    const current = levels[depth - 1];
    levels[depth - 1] =
      startOverride ?? (current === undefined ? start : current + 1);
    levels.length = depth;
    if (!level) return '';
    return `${level.prefix}${formatNumber(levels[depth - 1], level.format)}${level.suffix}`;
  }
}

/** Parts of a paragraph that are never read as its own text. */
const SKIPPED = new Set([
  'note',
  'annotation',
  'annotation-end',
  'bookmark',
  'bookmark-start',
  'bookmark-end',
  'soft-page-break',
  'sequence-decls',
  'tracked-changes',
  'forms',
]);

/**
 * Pull the text and pictures out of an .odt. Pictures come back as blobs with
 * the paragraph they were anchored to recorded on that line; nothing is
 * uploaded here. A table row is one line with one segment per cell.
 */
export async function readOdt(file: Blob): Promise<OdtContent> {
  const zip = await new JSZip().loadAsync(file);
  const contentFile = zip.file(CONTENT_PATH);
  if (!contentFile) {
    throw new Error(
      "This OpenDocument file couldn't be read. Try saving it again as .odt or .docx."
    );
  }
  const parse = (xml: string): Document =>
    new DOMParser().parseFromString(xml, 'application/xml');
  const content = parse(await contentFile.async('string'));
  const stylesXml = await zip.file(STYLES_PATH)?.async('string');
  const styles = new OdtStyles(
    stylesXml ? [parse(stylesXml), content] : [content]
  );
  const counters = new ListCounters(styles);

  const body =
    Array.from(content.getElementsByTagName('*')).find(
      (el) =>
        localName(el) === 'text' &&
        el.parentElement !== null &&
        localName(el.parentElement) === 'body'
    ) ?? content.documentElement;

  const images: ExtractedImage[] = [];
  const imageIdByPath = new Map<string, string>();

  const imageFor = async (frame: Element): Promise<string | null> => {
    for (const image of childrenNamed(frame, 'image')) {
      const href = (attr(image, 'xlink:href') ?? '').replace(/^\.?\//, '');
      const contentType = IMAGE_TYPES[extensionOf(href)];
      if (!href || !contentType) continue;
      // One picture used by several questions stays one stimulus (D14).
      const known = imageIdByPath.get(href);
      if (known) return known;
      const entry = zip.file(href);
      if (!entry) continue;
      const id = `img-${images.length + 1}`;
      imageIdByPath.set(href, id);
      images.push({
        id,
        blob: new Blob([(await entry.async('uint8array')) as BlobPart], {
          type: contentType,
        }),
        contentType,
        name: href.split('/').pop() ?? href,
      });
      return id;
    }
    return null;
  };

  interface ParagraphRead {
    segments: DocSegment[];
    imageIds: string[];
    /** Text boxes anchored here, read as lines of their own after it. */
    boxes: Element[];
  }

  const readParagraph = async (
    paragraph: Element,
    prefix = ''
  ): Promise<ParagraphRead> => {
    const segments: DocSegment[] = prefix
      ? [{ text: prefix }, { text: '' }]
      : [{ text: '' }];
    const imageIds: string[] = [];
    const boxes: Element[] = [];
    const paragraphEmphasis = styles.emphasized(
      attr(paragraph, 'text:style-name')
    );

    const visit = async (el: Element, emphasized: boolean): Promise<void> => {
      for (const node of Array.from(el.childNodes)) {
        const current = segments[segments.length - 1];
        if (node.nodeType === 3) {
          // XML whitespace collapses like HTML's; `text:s` carries real spaces.
          const chunk = (node.textContent ?? '').replace(/[\r\n\t]+/g, ' ');
          current.text += chunk;
          if (emphasized && /[A-Za-z0-9]/.test(chunk))
            current.emphasized = true;
          continue;
        }
        if (node.nodeType !== 1) continue;
        const child = node as Element;
        const name = localName(child);
        if (SKIPPED.has(name)) continue;
        if (name === 'tab') {
          segments.push({ text: '' });
        } else if (name === 's') {
          current.text += ' '.repeat(Number(attr(child, 'text:c') ?? '1') || 1);
        } else if (name === 'line-break') {
          current.text += ' ';
        } else if (name === 'frame') {
          const id = await imageFor(child);
          if (id) imageIds.push(id);
          boxes.push(...childrenNamed(child, 'text-box'));
        } else {
          await visit(
            child,
            emphasized || styles.emphasized(attr(child, 'text:style-name'))
          );
        }
      }
    };
    await visit(paragraph, paragraphEmphasis);
    return { segments, imageIds, boxes };
  };

  const joinSegments = (segments: readonly DocSegment[]): string =>
    segments.map((s) => s.text).join(' ');

  const lines: DocLine[] = [];

  const pushLine = (segments: DocSegment[], imageIds: string[]): void => {
    const trimmed = segments.map((s) => ({ ...s, text: s.text.trim() }));
    const text = joinSegments(trimmed);
    if (!text.trim() && imageIds.length === 0) return;
    const emphasized = trimmed.some((s) => s.emphasized);
    lines.push({
      text,
      ...(trimmed.length > 1 ? { segments: trimmed } : {}),
      ...(emphasized ? { emphasized: true } : {}),
      ...(imageIds.length > 0 ? { imageIds } : {}),
    });
  };

  /** Everything inside a cell flattened into one segment, nested tables included. */
  const readCell = async (
    cell: Element
  ): Promise<{ segment: DocSegment; imageIds: string[] }> => {
    const pieces: string[] = [];
    const imageIds: string[] = [];
    let emphasized = false;
    const visit = async (el: Element): Promise<void> => {
      for (const c of Array.from(el.children)) {
        const name = localName(c);
        if (name === 'p' || name === 'h') {
          const read = await readParagraph(c);
          const text = joinSegments(read.segments).replace(/\s+/g, ' ').trim();
          if (text) pieces.push(text);
          if (read.segments.some((s) => s.emphasized)) emphasized = true;
          imageIds.push(...read.imageIds);
          for (const box of read.boxes) await visit(box);
        } else if (!SKIPPED.has(name)) {
          await visit(c);
        }
      }
    };
    await visit(cell);
    return {
      segment: {
        text: pieces.join(' '),
        ...(emphasized ? { emphasized: true } : {}),
      },
      imageIds,
    };
  };

  const readRow = async (row: Element): Promise<void> => {
    const segments: DocSegment[] = [];
    const imageIds: string[] = [];
    for (const cell of Array.from(row.children)) {
      const name = localName(cell);
      if (name === 'covered-table-cell') {
        segments.push({ text: '' });
      } else if (name === 'table-cell') {
        const read = await readCell(cell);
        segments.push(read.segment);
        imageIds.push(...read.imageIds);
      }
    }
    pushLine(segments, imageIds);
  };

  const walkList = async (
    list: Element,
    listStyle: string,
    depth: number
  ): Promise<void> => {
    for (const item of Array.from(list.children)) {
      const itemName = localName(item);
      if (itemName !== 'list-item' && itemName !== 'list-header') continue;
      const startValue = attr(item, 'text:start-value');
      let prefix =
        itemName === 'list-item'
          ? counters.next(
              listStyle,
              depth,
              startValue ? Number(startValue) : undefined
            )
          : '';
      for (const c of Array.from(item.children)) {
        const name = localName(c);
        if (name === 'list') {
          await walkList(c, attr(c, 'text:style-name') ?? listStyle, depth + 1);
        } else if (name === 'p' || name === 'h') {
          // Only an item's first paragraph carries its number.
          await readBlock(c, prefix);
          prefix = '';
        } else {
          await walk(c);
        }
      }
    }
  };

  const readBlock = async (paragraph: Element, prefix = ''): Promise<void> => {
    const read = await readParagraph(paragraph, prefix);
    pushLine(read.segments, read.imageIds);
    for (const box of read.boxes) await walk(box);
  };

  const walk = async (el: Element): Promise<void> => {
    for (const c of Array.from(el.children)) {
      const name = localName(c);
      if (SKIPPED.has(name)) continue;
      if (name === 'p' || name === 'h') {
        await readBlock(c);
      } else if (name === 'list') {
        const listStyle = attr(c, 'text:style-name') ?? '';
        const continues =
          attr(c, 'text:continue-numbering') === 'true' ||
          Boolean(attr(c, 'text:continue-list'));
        if (!continues) counters.reset(listStyle);
        await walkList(c, listStyle, 1);
      } else if (name === 'table-row') {
        await readRow(c);
      } else if (name !== 'table-columns' && name !== 'table-column') {
        await walk(c);
      }
    }
  };
  await walk(body);

  return { lines, images };
}
