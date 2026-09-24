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
  /**
   * Decode every `<img>` before opening the print dialog. Without it the
   * browser prints whatever has loaded by the time `print()` runs, which for
   * an image is usually an empty box.
   */
  awaitImages?: boolean;
  /**
   * Called once every image is decoded and the dialog is about to open, or
   * immediately when there is nothing to wait for. A caller whose `<img>`
   * sources are object URLs it owns uses this to know when it may free them.
   */
  onImagesReady?: () => void;
  /**
   * Page margins drawn by the document instead of `@page`, so the browser has
   * no margin to print its own header and footer (the "about:blank" URL) in.
   */
  marginMm?: { vertical: number; horizontal: number };
  /** Runs after fonts load and images decode, just before the dialog opens; may reflow the page. */
  beforePrint?: (win: Window) => void | Promise<void>;
}

// Chrome repeats a table's thead and tfoot on every printed page, which gives
// each page its top and bottom margin once `@page` has none.
const marginStyles = (m: { vertical: number; horizontal: number }): string => `
  @page { margin: 0; }
  table.page-margins { width: 100%; border-collapse: collapse; }
  table.page-margins > thead td, table.page-margins > tfoot td { height: ${m.vertical}mm; padding: 0; }
  table.page-margins > tbody > tr > td { padding: 0 ${m.horizontal}mm; }
`;

const withDrawnMargins = (body: string): string =>
  `<table class="page-margins"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>${body}</td></tr></tbody></table>`;

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
    <style>${doc.styles}${doc.marginMm ? marginStyles(doc.marginMm) : ''}</style>
  </head>
  <body>${doc.marginMm ? withDrawnMargins(doc.body) : doc.body}</body>
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

  const show = () => {
    doc.onImagesReady?.();
    printWindow.focus();
    printWindow.print();
  };
  if (!doc.awaitImages && !doc.beforePrint) {
    show();
    return;
  }
  const images = Array.from(printWindow.document.images ?? []);
  const fonts = doc.beforePrint
    ? printWindow.document.fonts?.ready.catch(() => undefined)
    : undefined;
  // A failed decode still prints: the modal has already blocked a stimulus it
  // could not fetch, so the alternative here is a dialog that never opens.
  void Promise.all([
    fonts,
    ...images.map((img) => img.decode().catch(() => undefined)),
  ])
    .then(async () => {
      try {
        await doc.beforePrint?.(printWindow);
      } catch {
        // A failed measurement prints unpadded rather than not at all.
      }
    })
    .then(show);
}
