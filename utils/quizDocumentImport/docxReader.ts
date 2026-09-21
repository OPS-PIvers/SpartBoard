/**
 * Reads a .docx (and so a Google Doc, which Drive exports as one — D4) into
 * lines and pictures, per docs/plans/QUIZ_DOCUMENT_IMPORT.md D2 and D13.
 *
 * A Word file is a zip: `word/document.xml` holds the text, `word/media/*`
 * the pictures, and `word/_rels/document.xml.rels` ties an image reference in
 * the text back to its file. Reading the XML rather than a flattened text
 * export is what keeps bold, underline and highlight — which is how a teacher
 * marks the right answer in a Word test — and what anchors a picture to the
 * paragraph it sits in.
 */

import JSZip from 'jszip';
import type { DocLine, ExtractedImage } from './types';

const DOCUMENT_PATH = 'word/document.xml';
const RELS_PATH = 'word/_rels/document.xml.rels';

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

/** Relationship ids of every picture drawn inside this paragraph. */
function embedIdsIn(paragraph: Element): string[] {
  const ids: string[] = [];
  for (const blip of Array.from(paragraph.getElementsByTagName('*'))) {
    if (localName(blip) !== 'blip') continue;
    const id = blip.getAttribute('r:embed') ?? blip.getAttribute('embed');
    if (id) ids.push(id);
  }
  return ids;
}

function paragraphText(paragraph: Element): {
  text: string;
  emphasized: boolean;
} {
  let text = '';
  let sawEmphasizedWord = false;
  for (const node of Array.from(paragraph.getElementsByTagName('*'))) {
    const name = localName(node);
    if (name === 'tab') {
      text += ' ';
      continue;
    }
    if (name === 'br') {
      text += ' ';
      continue;
    }
    if (name !== 't') continue;
    const run = node.parentElement;
    const chunk = node.textContent ?? '';
    text += chunk;
    if (run && /[A-Za-z0-9]/.test(chunk) && runIsEmphasized(run)) {
      sawEmphasizedWord = true;
    }
  }
  return { text, emphasized: sawEmphasizedWord };
}

const extensionOf = (path: string): string =>
  path.split('.').pop()?.toLowerCase() ?? '';

/**
 * Pull the text and pictures out of a Word file. Pictures come back as blobs
 * with the paragraph they were anchored to recorded on that line; nothing is
 * uploaded here.
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

  const xml = await documentFile.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  const images: ExtractedImage[] = [];
  const imageIdByTarget = new Map<string, string>();

  const lines: DocLine[] = [];
  for (const paragraph of Array.from(doc.getElementsByTagName('*'))) {
    if (localName(paragraph) !== 'p') continue;
    const { text, emphasized } = paragraphText(paragraph);

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

    if (!text.trim() && imageIds.length === 0) continue;
    lines.push({
      text,
      ...(emphasized ? { emphasized: true } : {}),
      ...(imageIds.length > 0 ? { imageIds } : {}),
    });
  }

  return { lines, images };
}
