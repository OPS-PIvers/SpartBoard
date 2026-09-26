/**
 * Reads a .docx (and so a Google Doc, which Drive exports as one — D4) into
 * lines and pictures, per docs/plans/shipped/QUIZ_DOCUMENT_IMPORT.md D2 and D13.
 *
 * A Word file is a zip: `word/document.xml` holds the text, `word/media/*`
 * the pictures, and `word/_rels/document.xml.rels` ties an image reference in
 * the text back to its file. Reading the XML rather than a flattened text
 * export is what keeps bold, underline and highlight — which is how a teacher
 * marks the right answer in a Word test — and what anchors a picture to the
 * paragraph it sits in.
 */

import JSZip from 'jszip';
import { DocxNumbering } from './docxNumbering';
import type { DocLine, DocSegment, ExtractedImage } from './types';

const DOCUMENT_PATH = 'word/document.xml';
const RELS_PATH = 'word/_rels/document.xml.rels';
const NUMBERING_PATH = 'word/numbering.xml';
const STYLES_PATH = 'word/styles.xml';

/** Extensions Quiz can show as an image stimulus. */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export interface DocxContent {
  lines: DocLine[];
  images: ExtractedImage[];
}

const localName = (el: Element): string =>
  el.tagName.includes(':') ? el.tagName.split(':')[1] : el.tagName;

/** Run properties that a teacher uses to mark an answer. */
function runIsEmphasized(run: Element): boolean {
  const props = Array.from(run.children).find((c) => localName(c) === 'rPr');
  if (!props) return false;
  for (const p of Array.from(props.children)) {
    const name = localName(p);
    if (name === 'b' || name === 'u') {
      // `<w:b w:val="0"/>` turns it back off.
      const val = p.getAttribute('w:val') ?? p.getAttribute('val');
      if (val === '0' || val === 'false' || val === 'none') continue;
      return true;
    }
    if (name === 'highlight') {
      const val = p.getAttribute('w:val') ?? p.getAttribute('val');
      if (val && val !== 'none') return true;
    }
  }
  return false;
}

/** `rId7` → `media/image2.png`, from the document's relationship part. */
function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  for (const rel of Array.from(doc.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) map.set(id, target.replace(/^\/+/, ''));
  }
  return map;
}

/** Text boxes and legacy fallbacks are read separately, never as part of their anchor. */
const SKIPPED_SUBTREES = new Set(['txbxContent', 'Fallback', 'pPr']);

/** Descendants of `el` in document order, not entering skipped subtrees. */
function* ownNodes(el: Element): Generator<Element> {
  for (const c of Array.from(el.children)) {
    if (SKIPPED_SUBTREES.has(localName(c))) continue;
    yield c;
    yield* ownNodes(c);
  }
}

/** Text boxes anchored in this paragraph, outermost only. */
function textBoxesIn(el: Element): Element[] {
  const found: Element[] = [];
  for (const c of Array.from(el.children)) {
    const name = localName(c);
    if (name === 'Fallback') continue;
    if (name === 'txbxContent') found.push(c);
    else found.push(...textBoxesIn(c));
  }
  return found;
}

/** Relationship ids of every picture drawn inside this paragraph. */
function embedIdsIn(paragraph: Element): string[] {
  const ids: string[] = [];
  for (const blip of ownNodes(paragraph)) {
    if (localName(blip) !== 'blip') continue;
    const id = blip.getAttribute('r:embed') ?? blip.getAttribute('embed');
    if (id) ids.push(id);
  }
  return ids;
}

/** A paragraph's text split at tabs, with emphasis per piece. */
function paragraphSegments(paragraph: Element): DocSegment[] {
  const segments: DocSegment[] = [{ text: '' }];
  for (const node of ownNodes(paragraph)) {
    const name = localName(node);
    const current = segments[segments.length - 1];
    if (name === 'tab') {
      segments.push({ text: '' });
      continue;
    }
    if (name === 'br' || name === 'cr') {
      current.text += ' ';
      continue;
    }
    if (name === 'noBreakHyphen') {
      current.text += '-';
      continue;
    }
    if (name !== 't') continue;
    const run = node.parentElement;
    const chunk = node.textContent ?? '';
    current.text += chunk;
    if (run && /[A-Za-z0-9]/.test(chunk) && runIsEmphasized(run)) {
      current.emphasized = true;
    }
  }
  return segments;
}

const joinSegments = (segments: readonly DocSegment[]): string =>
  segments.map((s) => s.text).join(' ');

const extensionOf = (path: string): string =>
  path.split('.').pop()?.toLowerCase() ?? '';

/**
 * Pull the text and pictures out of a Word file. Pictures come back as blobs
 * with the paragraph they were anchored to recorded on that line; nothing is
 * uploaded here. A table row is one line with one segment per cell (R2).
 */
export async function readDocx(file: Blob): Promise<DocxContent> {
  const zip = await new JSZip().loadAsync(file);

  const documentFile = zip.file(DOCUMENT_PATH);
  if (!documentFile) {
    throw new Error(
      "This Word file couldn't be read. Try saving it again as .docx."
    );
  }

  const relsFile = zip.file(RELS_PATH);
  const rels: Map<string, string> = relsFile
    ? parseRels(await relsFile.async('string'))
    : new Map<string, string>();

  const numbering = new DocxNumbering({
    numberingXml: await zip.file(NUMBERING_PATH)?.async('string'),
    stylesXml: await zip.file(STYLES_PATH)?.async('string'),
  });

  const xml = await documentFile.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body =
    Array.from(doc.getElementsByTagName('*')).find(
      (el) => localName(el) === 'body'
    ) ?? doc.documentElement;

  const images: ExtractedImage[] = [];
  const imageIdByTarget = new Map<string, string>();

  const imagesOf = async (paragraph: Element): Promise<string[]> => {
    const imageIds: string[] = [];
    for (const embedId of embedIdsIn(paragraph)) {
      const target = rels.get(embedId);
      if (!target) continue;
      const path = target.startsWith('word/') ? target : `word/${target}`;
      const contentType = IMAGE_TYPES[extensionOf(path)];
      if (!contentType) continue;

      // One picture used by several questions stays one stimulus (D14).
      let id = imageIdByTarget.get(path);
      if (!id) {
        const entry = zip.file(path);
        if (!entry) continue;
        id = `img-${images.length + 1}`;
        imageIdByTarget.set(path, id);
        images.push({
          id,
          blob: await entry.async('blob'),
          contentType,
          name: path.split('/').pop() ?? path,
        });
      }
      imageIds.push(id);
    }
    return imageIds;
  };

  /** One paragraph's segments, numbering prefix first. */
  const readParagraph = async (
    paragraph: Element
  ): Promise<{ segments: DocSegment[]; imageIds: string[] }> => {
    const prefix = numbering.prefixFor(paragraph);
    const own = paragraphSegments(paragraph);
    return {
      segments: prefix ? [{ text: prefix }, ...own] : own,
      imageIds: await imagesOf(paragraph),
    };
  };

  const lines: DocLine[] = [];

  const pushLine = (segments: DocSegment[], imageIds: string[]): void => {
    const text = joinSegments(segments);
    if (!text.trim() && imageIds.length === 0) return;
    const emphasized = segments.some((s) => s.emphasized);
    lines.push({
      text,
      ...(segments.length > 1 ? { segments } : {}),
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
        if (name === 'p') {
          const read = await readParagraph(c);
          const text = joinSegments(read.segments).trim();
          if (text) pieces.push(text);
          if (read.segments.some((s) => s.emphasized)) emphasized = true;
          imageIds.push(...read.imageIds);
          for (const box of textBoxesIn(c)) await visit(box);
        } else if (name !== 'tcPr' && name !== 'tblPr' && name !== 'trPr') {
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
    for (const cell of Array.from(row.getElementsByTagName('*'))) {
      if (localName(cell) !== 'tc') continue;
      // Only this row's own cells; a nested table's cells stay in their parent.
      let parentRow = cell.parentElement;
      while (parentRow && localName(parentRow) !== 'tr')
        parentRow = parentRow.parentElement;
      if (parentRow !== row) continue;
      const props = Array.from(cell.children).find(
        (c) => localName(c) === 'tcPr'
      );
      const vMerge = props
        ? Array.from(props.children).find((c) => localName(c) === 'vMerge')
        : undefined;
      const mergeVal = vMerge
        ? (vMerge.getAttribute('w:val') ?? vMerge.getAttribute('val'))
        : null;
      if (vMerge && mergeVal !== 'restart') {
        segments.push({ text: '' });
        continue;
      }
      const read = await readCell(cell);
      segments.push(read.segment);
      imageIds.push(...read.imageIds);
    }
    pushLine(segments, imageIds);
  };

  const walk = async (el: Element): Promise<void> => {
    for (const c of Array.from(el.children)) {
      const name = localName(c);
      if (name === 'p') {
        const read = await readParagraph(c);
        pushLine(read.segments, read.imageIds);
        for (const box of textBoxesIn(c)) await walk(box);
      } else if (name === 'tr') {
        await readRow(c);
      } else if (name !== 'sectPr' && name !== 'tblPr' && name !== 'tblGrid') {
        await walk(c);
      }
    }
  };
  await walk(body);

  return { lines, images };
}
