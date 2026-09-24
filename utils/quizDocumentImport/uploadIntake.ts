/**
 * What the test-and-key uploader decides about a file before anything is
 * read in earnest: whether it looks like an answer key (R16, R32), how photos
 * are ordered (R30), and turning an iPhone photo into one a browser can draw.
 */

import { documentKind, isHeicFile } from './fileKind';

/** A picked document, or a set of photos read as its pages in order. */
export interface UploadedDocument {
  file: Blob;
  fileName: string;
  /** Present for photos: every page, `file` being the first. */
  pages?: Blob[];
}

const KEY_NAME = /key|answer|scoring|guide/i;
/** `1. B`, `12) c`, `3 - True`, `4. B 2pts`: a number, a short answer, then nothing wordy. */
const KEY_ENTRY =
  /^\s*(?:q(?:uestion)?\s*)?\d{1,3}\s*[.):-]?\s*\(?(?:[a-f]|t|f|true|false)\)?\s*(?:$|[,;(]|\d{1,3}\s*[.):-]|\d*\s*pts?\b|\d*\s*points?\b)/i;
const CORRECT_ANSWER = /correct\s+answers?\s*:/gi;

export const HEIC_UNREADABLE =
  'Couldn’t open this iPhone photo. Export it as JPEG and try again.';

export function looksLikeKeyName(name: string): boolean {
  return KEY_NAME.test(name.replace(/\.[^.]+$/, ''));
}

/** Half its lines are key entries, or it labels three correct answers. */
export function looksLikeKeyText(lines: readonly string[]): boolean {
  const text = lines.map((l) => l.trim()).filter(Boolean);
  if (text.length === 0) return false;
  if ((text.join('\n').match(CORRECT_ANSWER) ?? []).length >= 3) return true;
  const entries = text.filter((l) => KEY_ENTRY.test(l)).length;
  return entries / text.length >= 0.5;
}

/** A document's plain lines, cheaply: text layer only, never OCR. */
async function quickLines(file: Blob, name: string): Promise<string[]> {
  const kind = documentKind(file, name);
  if (kind === 'docx') {
    const { readDocx } = await import('./docxReader');
    return (await readDocx(file)).lines.map((l) => l.text);
  }
  if (kind === 'rtf') {
    const { readRtf } = await import('./rtfReader');
    return (await readRtf(file)).lines.map((l) => l.text);
  }
  if (kind === 'pdf') {
    const [{ browserPdfDeps }, { readPdf }] = await Promise.all([
      import('./pdfBrowserDeps'),
      import('./pdfReader'),
    ]);
    const { loadPdf } = await browserPdfDeps(file);
    return (await readPdf(file, { loadPdf }, { maxPages: 20 })).lines.map(
      (l) => l.text
    );
  }
  return [];
}

/** R16: by name first, then by what the file says. Never throws. */
export async function looksLikeAnswerKey(
  file: Blob,
  name: string,
  readLines: (file: Blob, name: string) => Promise<string[]> = quickLines
): Promise<boolean> {
  if (looksLikeKeyName(name)) return true;
  try {
    return looksLikeKeyText(await readLines(file, name));
  } catch {
    return false;
  }
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/** `page 2` before `page 10`, the way a phone names its photos. */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

/** A HEIC photo becomes a PNG; anything else passes through. */
export async function decodeIfHeic(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  try {
    const { heicTo } = await import('heic-to/csp');
    const png = await heicTo({ blob: file, type: 'image/png' });
    return new File([png], file.name.replace(/\.(heic|heif)$/i, '.png'), {
      type: 'image/png',
    });
  } catch (err) {
    console.warn('[quizImport] HEIC decode failed', err);
    throw new Error(HEIC_UNREADABLE);
  }
}
