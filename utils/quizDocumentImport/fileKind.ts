/** What a picked file is and what to call the quiz it becomes (D11). */

export type DocumentKind = 'pdf' | 'docx' | 'rtf';

const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const RTF_TYPES = new Set(['application/rtf', 'text/rtf', 'text/richtext']);

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
  return null;
}

export const UNREADABLE_FILE =
  'That file type can’t be read. Upload a PDF, a Word file (.docx), a rich text file (.rtf) or a Google Doc.';

/** The document name without its extension, which becomes the quiz title (D11). */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'Imported Quiz';
}
