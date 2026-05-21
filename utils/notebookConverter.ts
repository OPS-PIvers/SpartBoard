import JSZip from 'jszip';
import { NotebookSection } from '@/types';
import {
  PAGE_SVG_RE,
  imageSubtype,
  imageHrefRegex,
  ensureSvgNamespaces,
  buildImageLookup,
  resolveImageKey,
  resolvePageOrder,
  svgDimensions,
} from './smartNotebook';

/**
 * Client-side SMART Notebook -> .spartnb converter. The browser counterpart of
 * scripts/smart2spart/smart2spart.py: parse the manifest for true page order +
 * lesson sections, downscale/recompress + inline every image, repair SVG
 * namespaces, and emit an optimized, self-contained .spartnb bundle. Runs
 * entirely in the browser (no upload, no server cost) so it can handle the big
 * decks the in-widget importer caps out on.
 */

/** Optimizes one image's bytes and returns a data URI. Injectable for tests. */
export type ImageOptimizer = (
  bytes: Uint8Array,
  mime: string,
  maxEdge: number,
  quality: number
) => Promise<string>;

export interface ConvertOptions {
  /** Cap the longest edge of embedded images, px. 0 disables resizing. */
  maxEdge?: number;
  /** WebP quality 0..1 for lossy re-encode. */
  quality?: number;
  /** Override the image optimizer (tests pass a canvas-free stub). */
  optimizeImage?: ImageOptimizer;
  /** Progress callback, fired after each page is written. */
  onProgress?: (done: number, total: number) => void;
}

export interface ConvertResult {
  blob: Blob;
  fileName: string;
  title: string;
  pageCount: number;
  sectionCount: number;
  bytesBefore: number;
  bytesAfter: number;
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });

/**
 * Default optimizer: decode with createImageBitmap, downscale on a canvas, and
 * re-encode as WebP. Keeps the original bytes if WebP isn't smaller or the
 * browser can't encode it. Falls back to inlining the original on any failure.
 */
const canvasOptimizeImage: ImageOptimizer = async (
  bytes,
  mime,
  maxEdge,
  quality
) => {
  const srcBlob = new Blob([bytes as BlobPart], { type: mime });
  try {
    const bitmap = await createImageBitmap(srcBlob);
    let { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (maxEdge > 0 && longest > maxEdge) {
      const scale = maxEdge / longest;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return blobToDataUrl(srcBlob);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    );
    if (webp && webp.size < bytes.byteLength) {
      return blobToDataUrl(webp);
    }
    return blobToDataUrl(srcBlob);
  } catch {
    return blobToDataUrl(srcBlob);
  }
};

const stripExtension = (name: string): string =>
  name.replace(/\.[^./\\]+$/, '');

export const convertNotebookToBundle = async (
  file: File,
  options: ConvertOptions = {}
): Promise<ConvertResult> => {
  const maxEdge = options.maxEdge ?? 1600;
  const quality = options.quality ?? 0.82;
  const optimizeImage = options.optimizeImage ?? canvasOptimizeImage;

  const zip = new JSZip();
  await zip.loadAsync(file);

  const pageNames: string[] = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir && PAGE_SVG_RE.test(relativePath))
      pageNames.push(relativePath);
  });
  if (pageNames.length === 0) {
    throw new Error('No SMART Notebook pages found in this file.');
  }

  const plan = await resolvePageOrder(zip, pageNames);
  const imageLookup = buildImageLookup(zip);
  const uriCache = new Map<string, string>();

  const out = new JSZip();
  const manifestPages: { file: string; width: number; height: number }[] = [];

  // Sequential page loop keeps peak memory bounded and progress meaningful.
  for (let index = 0; index < plan.order.length; index++) {
    const entry = zip.file(plan.order[index]);
    if (!entry) continue;
    let svgText = await entry.async('string');

    // Resolve every distinct image href to an optimized data URI (cached, so
    // an image reused across pages is decoded/encoded only once).
    const hrefs = new Set<string>();
    for (const match of svgText.matchAll(imageHrefRegex())) hrefs.add(match[2]);

    const uriByHref = new Map<string, string>();
    for (const href of hrefs) {
      const key = resolveImageKey(href, imageLookup);
      if (!key) continue;
      let uri = uriCache.get(key);
      if (!uri) {
        const name = imageLookup.get(key);
        const imgEntry = name ? zip.file(name) : null;
        if (!imgEntry) continue;
        const bytes = await imgEntry.async('uint8array');
        uri = await optimizeImage(
          bytes,
          `image/${imageSubtype(key)}`,
          maxEdge,
          quality
        );
        uriCache.set(key, uri);
      }
      uriByHref.set(href, uri);
    }

    svgText = svgText.replace(
      imageHrefRegex(),
      (full, attr: string, href: string) => {
        const uri = uriByHref.get(href);
        return uri ? `${attr}="${uri}"` : full;
      }
    );
    svgText = ensureSvgNamespaces(svgText);

    const { width, height } = svgDimensions(svgText);
    const outName = `pages/${index}.svg`;
    out.file(outName, svgText);
    manifestPages.push({ file: outName, width, height });

    options.onProgress?.(index + 1, plan.order.length);
  }

  const title = stripExtension(file.name);
  const sections: NotebookSection[] = plan.sections;
  out.file(
    'manifest.json',
    JSON.stringify(
      {
        version: 1,
        title,
        pageCount: manifestPages.length,
        pages: manifestPages,
        sections,
      },
      null,
      2
    )
  );

  const blob = await out.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
  });

  return {
    blob,
    fileName: `${title}.spartnb`,
    title,
    pageCount: manifestPages.length,
    sectionCount: sections.length,
    bytesBefore: file.size,
    bytesAfter: blob.size,
  };
};
