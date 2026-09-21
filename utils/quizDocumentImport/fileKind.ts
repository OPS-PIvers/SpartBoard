/** What a picked file is and what to call the quiz it becomes (D11). */

export type DocumentKind = 'pdf' | 'docx';

const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** What the file is, by type then by name; null when it is neither. */
export function documentKind(
  file: File | Blob,
  name = ''
): DocumentKind | null {
  const fileName = (name || (file as File).name || '').toLowerCase();
  if (file.type === 'application/pdf' || fileName.endsWith('.pdf'))
    return 'pdf';
  if (file.type === DOCX_TYPE || fileName.endsWith('.docx')) return 'docx';
  return null;
}

/** The document name without its extension, which becomes the quiz title (D11). */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return base || 'Imported Quiz';
}
