import JSZip from 'jszip';
import { NotebookObjectLink, NotebookSection } from '@/types';
import {
  PAGE_SVG_RE,
  extensionOf,
  extractShortcutLinks,
  imageSubtype,
  imageHrefRegex,
  ensureSvgNamespaces,
  buildImageLookup,
  resolveImageKey,
  resolvePageOrder,
  svgDimensions,
} from './smartNotebook';

export interface ParsedNotebook {
  title: string;
  pages: { blob: Blob; extension: string }[];
  assets: { blob: Blob; extension: string }[];
  sections?: NotebookSection[];
  /** Object→page hyperlinks extracted from SMART's `shortcut="page://…"`
   *  attributes, or carried through a pre-converted .spartnb bundle. */
  objectLinks?: NotebookObjectLink[];
}

/**
 * Raw `.notebook` files above this size are not inlined in the browser — the
 * memory cost of base64-inlining their (un-optimized) images is too high.
 * Instead the user is routed to the in-app converter (/convert), which
 * downscales images and produces a small, pre-optimized `.spartnb` bundle.
 * Already-converted bundles bypass this cap.
 */
const RAW_NOTEBOOK_INLINE_CAP_BYTES = 20 * 1024 * 1024;

/** Thrown when a raw `.notebook` is too large to process in the browser. */
export class NotebookTooLargeError extends Error {
  constructor(public readonly sizeMb: number) {
    super(
      `This SMART Notebook is ${sizeMb}MB — too large to import directly. ` +
        `Use the SpartBoard converter to shrink it, then import the .spartnb file.`
    );
    this.name = 'NotebookTooLargeError';
  }
}

// ---------------------------------------------------------------------------
// SpartBoard bundle (.spartnb) — produced by the converter (in-app or CLI).
// Pages are already self-contained, optimized SVGs; order + sections come from
// manifest.json. This path is cheap: just unpack in order.
// ---------------------------------------------------------------------------

interface BundleManifest {
  version?: number;
  title?: string;
  pages?: { file: string; width?: number; height?: number }[];
  sections?: NotebookSection[];
  objectLinks?: NotebookObjectLink[];
}

const parseBundle = async (
  zip: JSZip,
  manifestEntry: JSZip.JSZipObject,
  fallbackTitle: string
): Promise<ParsedNotebook> => {
  const manifest = JSON.parse(
    await manifestEntry.async('string')
  ) as BundleManifest;

  const pageList = Array.isArray(manifest.pages) ? manifest.pages : [];
  const pages = await Promise.all(
    pageList.map(async (p) => {
      const entry = zip.file(p.file);
      if (!entry) throw new Error(`Bundle missing page file: ${p.file}`);
      // JSZip's async('blob') returns application/octet-stream regardless of
      // file content. Re-wrap with the SVG mime type so the page renders when
      // served back from Storage via <img src>; without it the browser refuses
      // to render the response and every page shows a broken-image icon.
      const raw = await entry.async('blob');
      const blob = new Blob([raw], { type: 'image/svg+xml' });
      return { blob, extension: extensionOf(p.file) };
    })
  );

  if (pages.length === 0) {
    throw new Error('Bundle contains no pages.');
  }

  const sections =
    Array.isArray(manifest.sections) && manifest.sections.length > 0
      ? manifest.sections
      : undefined;

  const objectLinks =
    Array.isArray(manifest.objectLinks) && manifest.objectLinks.length > 0
      ? manifest.objectLinks
      : undefined;

  return {
    title: manifest.title?.trim() ? manifest.title : fallbackTitle,
    pages,
    assets: [], // images are inlined into the page SVGs
    sections,
    objectLinks,
  };
};

// ---------------------------------------------------------------------------
// Raw .notebook import: inline relative images/* as data URIs (no downscaling;
// guarded by the size cap above). Bigger files go through the converter.
// ---------------------------------------------------------------------------

/** Replace every relative images/* href in one page SVG with a data URI. */
const inlinePageImages = async (
  svgText: string,
  zip: JSZip,
  lookup: Map<string, string>,
  cache: Map<string, string>
): Promise<string> => {
  // Collect distinct hrefs first, resolve to data URIs, then sync-replace.
  const hrefs = new Set<string>();
  for (const match of svgText.matchAll(imageHrefRegex())) {
    hrefs.add(match[2]);
  }

  const uriByHref = new Map<string, string>();
  await Promise.all(
    Array.from(hrefs).map(async (href) => {
      const key = resolveImageKey(href, lookup);
      if (!key) return; // unresolvable; leave the original href in place
      let uri = cache.get(key);
      if (!uri) {
        const entryName = lookup.get(key);
        const entry = entryName ? zip.file(entryName) : null;
        if (!entry) return;
        const b64 = await entry.async('base64');
        uri = `data:image/${imageSubtype(key)};base64,${b64}`;
        cache.set(key, uri);
      }
      uriByHref.set(href, uri);
    })
  );

  return svgText.replace(
    imageHrefRegex(),
    (full, attr: string, href: string) => {
      const uri = uriByHref.get(href);
      return uri ? `${attr}="${uri}"` : full;
    }
  );
};

const parseRawNotebook = async (
  zip: JSZip,
  fileName: string
): Promise<ParsedNotebook> => {
  // Collect page SVGs and non-page image assets.
  const pageEntries: { name: string; obj: JSZip.JSZipObject }[] = [];
  const assetEntries: { name: string; obj: JSZip.JSZipObject }[] = [];

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (PAGE_SVG_RE.test(relativePath)) {
      pageEntries.push({ name: relativePath, obj: entry });
    } else if (
      !relativePath.endsWith('.xml') &&
      !/thumbnail/i.test(relativePath) &&
      /\.(png|jpg|jpeg|svg)$/i.test(relativePath)
    ) {
      assetEntries.push({ name: relativePath, obj: entry });
    }
  });

  // Fallback for notebooks that store rendered page rasters instead of SVGs.
  if (pageEntries.length === 0) {
    const preview = zip.file('preview.png') ?? zip.file('thumbnail.png');
    if (preview) {
      return {
        title: fileName,
        pages: [{ blob: await preview.async('blob'), extension: 'png' }],
        assets: [],
      };
    }
    throw new Error('No valid pages found in Notebook file.');
  }

  const availablePages = pageEntries.map((p) => p.name);
  const plan = await resolvePageOrder(zip, availablePages);
  const entryByName = new Map(pageEntries.map((p) => [p.name, p.obj]));
  // Map source filename → output page index. SMART's shortcut targets
  // reference original filenames; we need indices to populate
  // NotebookObjectLink.targetPage.
  const filenameToIndex = new Map<string, number>();
  plan.order.forEach((name, i) => filenameToIndex.set(name, i));

  // Inline images into each page (shared cache dedupes repeated images),
  // and lift any SMART page-jump shortcuts into an objectLinks list.
  const imageLookup = buildImageLookup(zip);
  const imageCache = new Map<string, string>();
  const collectedLinks: NotebookObjectLink[] = [];
  const pages = await Promise.all(
    plan.order.map(async (name, pageIndex) => {
      const obj = entryByName.get(name);
      if (!obj) throw new Error(`Missing page entry: ${name}`);
      const svgText = await obj.async('string');
      const inlined = await inlinePageImages(
        svgText,
        zip,
        imageLookup,
        imageCache
      );
      const withNs = ensureSvgNamespaces(inlined);
      const dims = svgDimensions(withNs);
      const { svg: finalSvg, links } = extractShortcutLinks(
        withNs,
        pageIndex,
        dims
      );
      for (const link of links) {
        const targetPage = filenameToIndex.get(link.targetFile);
        if (targetPage === undefined || targetPage === pageIndex) continue;
        collectedLinks.push({
          id: link.objectId,
          objectId: link.objectId,
          sourcePage: link.sourcePage,
          targetPage,
          xFrac: link.xFrac,
          yFrac: link.yFrac,
          wFrac: link.wFrac,
          hFrac: link.hFrac,
        });
      }
      return {
        blob: new Blob([finalSvg], { type: 'image/svg+xml' }),
        extension: 'svg',
      };
    })
  );

  // Surface the raw images as draggable assets (the Viewer "drag to board"
  // feature). Pages already render fully via inlined data URIs.
  const assets = await Promise.all(
    assetEntries.map(async (entry) => ({
      blob: await entry.obj.async('blob'),
      extension: extensionOf(entry.name),
    }))
  );

  return {
    title: fileName,
    pages,
    assets,
    sections: plan.sections.length > 0 ? plan.sections : undefined,
    objectLinks: collectedLinks.length > 0 ? collectedLinks : undefined,
  };
};

export const parseNotebookFile = async (
  file: File
): Promise<ParsedNotebook> => {
  const zip = new JSZip();
  await zip.loadAsync(file);

  // 1. Pre-converted SpartBoard bundle (.spartnb): cheap, optimized fast-path.
  const manifestEntry = zip.file('manifest.json');
  if (manifestEntry) {
    return parseBundle(zip, manifestEntry, file.name);
  }

  // 2. Raw SMART .notebook. Guard against inlining huge files in the browser.
  if (file.size > RAW_NOTEBOOK_INLINE_CAP_BYTES) {
    throw new NotebookTooLargeError(Math.round(file.size / (1024 * 1024)));
  }
  return parseRawNotebook(zip, file.name);
};
