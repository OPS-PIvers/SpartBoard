/** What a picked file is and what to call the quiz it becomes (D11). */

export type DocumentKind = 'pdf' | 'docx' | 'rtf' | 'cartridge' | 'image';

const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const RTF_TYPES = new Set(['application/rtf', 'text/rtf', 'text/richtext']);
const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);
const IMAGE_EXTENSION = /\.(jpe?g|png|heic|heif)$/;
const HEIC_EXTENSION = /\.(heic|heif)$/;

/** What the file is, by type then by name; null when it is none of them. */
export function documentKind(
  file: File | Blob,
  name = ''
): DocumentKind | null {
  const fileName = (name || (file as File).name || '').toLowerCase();
  if (file.type === 'application/pdf' || fileName.endsWith('.pdf'))
    return 'pdf';
  if (file.type === DOCX_TYPE || fileName.endsWith('.docx')) return 'docx';
  // The extension decides for RTF: Windows hands .rtf out as application/msword.
  if (RTF_TYPES.has(file.type) || fileName.endsWith('.rtf')) return 'rtf';
  // An LMS export is a zip, so only the extension identifies it.
  if (fileName.endsWith('.imscc')) return 'cartridge';
  // A photo of the test, read by OCR a page per image (R15).
  if (IMAGE_TYPES.has(file.type) || IMAGE_EXTENSION.test(fileName))
    return 'image';
  return null;
}

/** An iPhone photo, which browsers other than Safari can't draw until decoded. */
export function isHeicFile(file: File | Blob, name = ''): boolean {
  const fileName = (name || (file as File).name || '').toLowerCase();
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    HEIC_EXTENSION.test(fileName)
  );
}

export const UNREADABLE_FILE =
  'That file type can’t be read. Upload a PDF, a Word file (.docx), a rich text file (.rtf), a Google Doc, an LMS export (.imscc) or photos of the pages.';

/** The document name without its extension, which becomes the quiz title (D11). */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'Imported Quiz';
}
