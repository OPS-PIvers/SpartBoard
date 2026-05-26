import type { DrawableObject, DrawingPage } from '@/types';
import { renderObject } from './renderers/dispatcher';
import { ensureImageLoaded } from './renderers/image';
import { paintBackground } from './backgroundTemplates';

// Export pipeline for the DrawingWidget (Phase 2 PR 2.5).
//
// Two outputs:
// 1. PNG (current page, all pages) via `canvas.toDataURL`.
// 2. PDF — opens the browser print dialog scoped to a hidden window
//    containing one full-page <img> per page. NO new dependency: jspdf and
//    friends cost ~250KB minified and the OS printer's "Save as PDF" output
//    is universally available on all supported browsers.
//
// The renderer dispatcher (`renderObject`) is the single source of truth for
// how each `DrawableObject.kind` paints. The live canvas in
// `useDrawingCanvas.ts` uses the same import, so live and exported visuals
// never drift.

interface PageSize {
  w: number;
  h: number;
}

/**
 * Export a single page as a PNG data URL via the offscreen-render path. This
 * intentionally does NOT just read `canvas.toDataURL()` off the live widget
 * canvas: the live canvas's background sits on a sibling CSS div (for perf),
 * so a naive `toDataURL` would lose the grid / lines / dots template. Going
 * through `renderPageToPng` bakes the background into pixels and reuses the
 * exact same renderer the live widget uses.
 *
 * Always clean — no selection chrome ever appears on the offscreen canvas,
 * regardless of what the user has selected at the moment of export.
 */
export const exportPagePng = (
  page: DrawingPage,
  pageSize: PageSize
): Promise<string> => renderPageToPng(page, pageSize);

/**
 * Wait for every ImageObject in `objects` to finish decoding. The renderer's
 * image cache is module-level and image bytes load asynchronously; if we paint
 * the offscreen canvas before all images are ready, they're missing from the
 * exported file. Pre-loading here decouples export latency from the order in
 * which the live canvas happened to paint things.
 *
 * Uses `ensureImageLoaded` so the SAME module-level cache that `renderImage`
 * reads from is populated by the export pipeline. Without this, the locally-
 * allocated Image elements would be GC'd before the offscreen paint runs and
 * `renderImage` would re-allocate on a cache miss — meaning the offscreen
 * paint would see "still loading" and skip the image entirely.
 *
 * Failed loads (CORS, 404) are resolved (not rejected) by `ensureImageLoaded`
 * so one bad image doesn't block the export of every other object on the page.
 */
const preloadImages = async (
  objects: readonly DrawableObject[]
): Promise<void> => {
  const sources = new Set<string>();
  for (const obj of objects) {
    if (obj.kind === 'image') sources.add(obj.src);
  }
  if (sources.size === 0) return;

  await Promise.all(Array.from(sources).map((src) => ensureImageLoaded(src)));
};

/**
 * Paint a single page's content (background + objects) onto a freshly-allocated
 * offscreen canvas and return the PNG data URL. Selection chrome is never
 * rendered here — offscreen export is always clean.
 *
 * Object z-order matches the live renderer: sorted ascending so later-drawn
 * objects layer on top.
 */
const renderPageToPng = async (
  page: DrawingPage,
  pageSize: PageSize
): Promise<string> => {
  const offscreen = document.createElement('canvas');
  offscreen.width = pageSize.w;
  offscreen.height = pageSize.h;
  const ctx = offscreen.getContext('2d');
  if (!ctx) {
    // 2d context allocation only fails in vanishingly rare environments
    // (e.g. headless test without canvas polyfill). Return a sentinel data
    // URL instead of throwing so the caller's `Promise.all` doesn't reject
    // the whole batch.
    return '';
  }

  // 1. Pre-load all images. The renderer's cache then has every image ready,
  //    so the first synchronous paint draws them all without needing a second
  //    pass on `img.onload`.
  await preloadImages(page.objects);

  // 2. Paint the background template into pixels. The live canvas keeps the
  //    background as a sibling CSS div for perf; the exporter needs it baked
  //    in so the saved file matches what the teacher sees on screen.
  paintBackground(ctx, page.background ?? 'blank', pageSize.w, pageSize.h);

  // 3. Paint each object in z-order via the shared dispatcher. No selection
  //    chrome on the offscreen canvas, ever — the caller's live selection is
  //    irrelevant to a clean export.
  const sorted = [...page.objects].sort((a, b) => a.z - b.z);
  for (const obj of sorted) {
    renderObject(ctx, obj);
  }

  return offscreen.toDataURL('image/png');
};

/**
 * Export every page as a PNG data URL. One offscreen canvas per page;
 * resolves with an array indexed in page order. Used by the multi-page
 * download flow and the PDF print pipeline.
 */
export const exportAllPagesPng = async (
  pages: readonly DrawingPage[],
  pageSize: PageSize
): Promise<string[]> => {
  // Sequential await so each offscreen canvas can be garbage-collected before
  // the next allocates. Parallel paints would only help with `onImageLoad` in
  // a single offscreen, but `preloadImages` already serialises that step.
  const out: string[] = [];
  for (const page of pages) {
    out.push(await renderPageToPng(page, pageSize));
  }
  return out;
};

/**
 * Trigger a browser download for a data URL. Re-implements the link-click
 * pattern used in `AnnotationOverlay.handleDownload` so the export module
 * stays free of dashboard-context imports.
 */
export const downloadDataUrl = (dataUrl: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  // Some browsers (notably Firefox) require the anchor to be in the DOM for
  // click() to trigger a download. We append, click, then remove on the next
  // tick so transient anchors don't leak into the document tree.
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Open the browser's print dialog with one full-page image per page. The
 * teacher uses the OS "Save as PDF" option to write the file.
 *
 * Why no `jspdf` (or similar): dep cost ~250KB minified for a feature most
 * teachers reach for ~once a week. The browser print pipeline is universal
 * across the supported browsers (per CLAUDE.md), produces correct PDFs, and
 * also lets users print to a physical printer in one shot.
 *
 * Implementation:
 * 1. Generate one PNG data URL per page via `exportAllPagesPng`.
 * 2. Open a new browser window and write a minimal HTML doc with one <img>
 *    per page. Each image is full-page sized via `@page` + `width:100%`.
 * 3. Wait for every <img> to decode in the new window, then call `print()`.
 * 4. The print dialog is the user's exit ramp — they save to PDF or print.
 */
export const exportPdf = async (
  pages: readonly DrawingPage[],
  pageSize: PageSize,
  // Test seam: allow tests to inject a fake `window.open` impl without monkey-
  // patching the global. Defaults to the real browser API.
  openWindow: (url?: string, target?: string) => Window | null = (
    url,
    target
  ) => window.open(url, target)
): Promise<void> => {
  const pngs = await exportAllPagesPng(pages, pageSize);
  if (pngs.length === 0) return;

  const printWindow = openWindow('', '_blank');
  if (!printWindow) {
    // Pop-up blocker — caller should toast. We throw a specific error so the
    // UI layer can distinguish "blocked" from "render failed".
    throw new Error('PDF export blocked: please allow pop-ups for this site.');
  }

  // Build the print doc. The `@page { size: ... }` and CSS reset guarantee
  // each image fills exactly one printed page without margins. The inline
  // `page-break-after: always` on each <img> is the source of truth for page
  // breaks — we deliberately do NOT duplicate the rule via `img + img` so
  // there's only one place to look when debugging multi-page PDFs.
  const imgsHtml = pngs
    .map(
      (src) =>
        `<img src="${src}" style="width:100%;height:auto;display:block;page-break-after:always;" />`
    )
    .join('');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Whiteboard Export</title>
    <style>
      @page { size: ${pageSize.w}px ${pageSize.h}px; margin: 0; }
      html, body { margin: 0; padding: 0; }
      img { width: 100%; height: auto; display: block; }
    </style>
  </head>
  <body>${imgsHtml}</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  // Auto-close the print window once the user dismisses the print dialog
  // (whether they printed or cancelled — Chrome fires `onafterprint` either
  // way). We MUST set this BEFORE calling `print()` so the handler is in
  // place when the dialog dismisses. A 30s fallback handles browsers that
  // don't reliably fire `onafterprint` (some Safari/Firefox builds): worst
  // case is a leaked tab if the user closes the print dialog within 30s and
  // we never get a signal, which is a clean degradation.
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    try {
      printWindow.close();
    } catch {
      /* cross-origin or already-closed window — ignore */
    }
  };
  printWindow.onafterprint = closeOnce;
  setTimeout(closeOnce, 30_000);

  // Trigger print only after every image has decoded. Otherwise the print
  // dialog can snapshot the page before pixels are ready and produce blank
  // PDFs on slower hardware.
  await waitForImagesInDoc(printWindow);
  printWindow.focus();
  printWindow.print();
};

/**
 * Resolve once every <img> in the target window's document has fired its
 * `load` event (or `error` — we still want to proceed if one image is broken
 * rather than hanging the print dialog forever).
 */
const waitForImagesInDoc = (printWindow: Window): Promise<void> => {
  const doc = printWindow.document;
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let remaining = images.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
    };
    for (const img of images) {
      if (img.complete && img.naturalWidth > 0) {
        done();
      } else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    }
  });
};
