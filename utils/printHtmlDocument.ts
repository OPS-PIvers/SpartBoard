/**
 * Opens a bare window, writes an HTML document into it and prints it — the
 * repo's print path (`exportCanvas.ts`), shared by the paper answer sheets and
 * the paper test. No PDF library: the OS print dialog offers "Save as PDF".
 */

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export type OpenWindow = (url?: string, target?: string) => Window | null;

export const defaultOpenWindow: OpenWindow = (url, target) =>
  window.open(url, target);

export interface PrintableDocument {
  title: string;
  styles: string;
  body: string;
}

/** Throws the same pop-up message as `exportPdf` when the window is blocked. */
export function printHtmlDocument(
  doc: PrintableDocument,
  openWindow: OpenWindow = defaultOpenWindow
): void {
  const printWindow = openWindow('', '_blank');
  if (!printWindow) {
    throw new Error('Printing blocked: please allow pop-ups for this site.');
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(doc.title)}</title>
    <style>${doc.styles}</style>
  </head>
  <body>${doc.body}</body>
</html>`);
  printWindow.document.close();

  // Set before print(): Chrome fires onafterprint whether the teacher printed
  // or cancelled. The timeout covers browsers that do not fire it at all.
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    try {
      printWindow.close();
    } catch {
      /* already closed */
    }
  };
  printWindow.onafterprint = closeOnce;
  setTimeout(closeOnce, 60_000);

  printWindow.focus();
  printWindow.print();
}
