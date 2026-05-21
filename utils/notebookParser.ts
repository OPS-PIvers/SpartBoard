import JSZip from 'jszip';
import { NotebookSection } from '@/types';

export interface ParsedNotebook {
  title: string;
  pages: { blob: Blob; extension: string }[];
  assets: { blob: Blob; extension: string }[];
  sections?: NotebookSection[];
}

/**
 * Raw `.notebook` files above this size are not inlined in the browser — the
 * memory cost of base64-inlining their images is too high. Instead the user is
 * directed to the `smart2spart` desktop converter, which produces a small,
 * pre-optimized `.spartnb` bundle. Already-converted bundles bypass this cap.
 */
const RAW_NOTEBOOK_INLINE_CAP_BYTES = 20 * 1024 * 1024;

/** Thrown when a raw `.notebook` is too large to process in the browser. */
export class NotebookTooLargeError extends Error {
  constructor(public readonly sizeMb: number) {
    super(
      `This SMART Notebook is ${sizeMb}MB — too large to import directly. ` +
        `Convert it with the SpartBoard desktop converter (smart2spart) first, ` +
        `then import the smaller .spartnb file.`
    );
    this.name = 'NotebookTooLargeError';
  }
}

const PAGE_NUM_RE = /(\d+)/;
const pageNumber = (name: string): number =>
  parseInt(name.match(PAGE_NUM_RE)?.[0] ?? '0', 10);

const extensionOf = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.svg')) return 'svg';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  if (lower.endsWith('.gif')) return 'gif';
  if (lower.endsWith('.webp')) return 'webp';
  return 'png';
};

const imageSubtype = (name: string): string => {
  const ext = extensionOf(name);
  if (ext === 'jpg') return 'jpeg';
  return ext; // png | gif | webp | svg
};

// ---------------------------------------------------------------------------
// SpartBoard bundle (.spartnb) — produced by the smart2spart desktop tool.
// Pages are already self-contained, optimized SVGs; order + sections come from
// manifest.json. This path is cheap: just unpack in order.
// ---------------------------------------------------------------------------

interface BundleManifest {
  version?: number;
  title?: string;
  pages?: { file: string; width?: number; height?: number }[];
  sections?: NotebookSection[];
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
      const blob = await entry.async('blob');
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

  return {
    title: manifest.title?.trim() ? manifest.title : fallbackTitle,
    pages,
    assets: [], // images are inlined into the page SVGs
    sections,
  };
};

// ---------------------------------------------------------------------------
// Raw .notebook manifest parsing (page order + lesson sections)
// Mirrors scripts/smart2spart/smart2spart.py:parse_manifest.
// ---------------------------------------------------------------------------

const orderedFileHrefs = (resource: Element): string[] => {
  const files = Array.from(resource.getElementsByTagNameNS('*', 'file'));
  return files
    .map((f) => f.getAttribute('href')?.replace(/\\/g, '/') ?? '')
    .filter((h) => h.toLowerCase().endsWith('.svg'));
};

interface ManifestPlan {
  order: string[];
  sections: NotebookSection[];
}

/**
 * Derive the true page order and lesson sections from imsmanifest.xml.
 * Preference: lesson groups (order + titles) > flat "pages" resource > numeric
 * filename sort. Orphan pages present on disk but unreferenced are appended so
 * none is ever dropped. `availablePages` filters dangling references.
 */
const parseManifest = (
  manifestXml: string,
  availablePages: string[]
): ManifestPlan => {
  const plan: ManifestPlan = { order: [], sections: [] };
  const available = new Set(availablePages);

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(manifestXml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return plan;
  } catch {
    return plan;
  }

  // identifier -> ordered list of page svg files
  const resources = new Map<string, string[]>();
  for (const resource of Array.from(
    doc.getElementsByTagNameNS('*', 'resource')
  )) {
    const id = resource.getAttribute('identifier');
    if (!id) continue;
    const files = orderedFileHrefs(resource);
    if (files.length > 0) resources.set(id, files);
  }

  // 1. Lesson groups -> order + sections
  const seen = new Set<string>();
  const orgs = Array.from(doc.getElementsByTagNameNS('*', 'organization'));
  for (const org of orgs) {
    const items = Array.from(org.getElementsByTagNameNS('*', 'item'));
    for (const item of items) {
      const ref = item.getAttribute('identifierref') ?? '';
      const titleEl = Array.from(item.getElementsByTagNameNS('*', 'title'))[0];
      const title = (titleEl?.textContent ?? '').trim();
      const groupPages = (resources.get(ref) ?? []).filter(
        (p) => available.has(p) && !seen.has(p)
      );
      if (groupPages.length === 0) continue;
      const start = plan.order.length;
      plan.order.push(...groupPages);
      groupPages.forEach((p) => seen.add(p));
      plan.sections.push({
        title: title || `Section ${plan.sections.length + 1}`,
        startIndex: start,
        pageCount: groupPages.length,
      });
    }
    if (plan.order.length > 0) break;
  }

  // 2. Fall back to the flat "pages" resource (no lesson grouping)
  if (plan.order.length === 0) {
    plan.order = (resources.get('pages') ?? []).filter((p) => available.has(p));
    plan.sections = [];
  }

  // 3. Append any present-but-unreferenced pages (defensive), numeric order
  const placed = new Set(plan.order);
  const orphans = availablePages
    .filter((p) => !placed.has(p))
    .sort((a, b) => pageNumber(a) - pageNumber(b));
  plan.order.push(...orphans);

  return plan;
};

// ---------------------------------------------------------------------------
// Raw .notebook image inlining (relative images/* -> data URIs)
// ---------------------------------------------------------------------------

const IMG_HREF_RE = /(\bxlink:href|\bhref)\s*=\s*"(images\/[^"]+)"/g;

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * SMART page SVGs omit the root `xmlns` declaration. They render inline inside
 * SMART, but a standalone SVG loaded via an <img> tag (how the Viewer displays
 * pages) will NOT render without the SVG namespace. Inject it (and xlink, if
 * used) into the opening <svg> tag when missing. Idempotent.
 */
const ensureSvgNamespaces = (svgText: string): string => {
  const match = /<svg\b/.exec(svgText);
  if (!match) return svgText;
  const tagEnd = svgText.indexOf('>', match.index);
  if (tagEnd === -1) return svgText;
  const head = svgText.slice(match.index, tagEnd);
  let additions = '';
  if (!head.includes('xmlns=')) additions += ` xmlns="${SVG_NS}"`;
  if (!head.includes('xmlns:xlink=') && svgText.includes('xlink:')) {
    additions += ` xmlns:xlink="${XLINK_NS}"`;
  }
  if (!additions) return svgText;
  const insertAt = match.index + '<svg'.length;
  return svgText.slice(0, insertAt) + additions + svgText.slice(insertAt);
};

const buildImageLookup = (zip: JSZip): Map<string, string> => {
  const lookup = new Map<string, string>();
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) {
      lookup.set(relativePath.replace(/\\/g, '/').toLowerCase(), relativePath);
    }
  });
  return lookup;
};

const resolveImageKey = (
  href: string,
  lookup: Map<string, string>
): string | null => {
  // Filenames may contain a literal '#' (e.g. "nickle front #1.jpg") written
  // un-encoded, so try the full path before treating '#' as a URL fragment.
  const candidates = [decodeURIComponent(href).replace(/\\/g, '/')];
  if (href.includes('#')) {
    candidates.push(decodeURIComponent(href.split('#')[0]).replace(/\\/g, '/'));
  }
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (lookup.has(key)) return key;
  }
  return null;
};

/** Replace every relative images/* href in one page SVG with a data URI. */
const inlinePageImages = async (
  svgText: string,
  zip: JSZip,
  lookup: Map<string, string>,
  cache: Map<string, string>
): Promise<string> => {
  // Collect distinct hrefs first, resolve to data URIs, then sync-replace.
  const hrefs = new Set<string>();
  for (const match of svgText.matchAll(IMG_HREF_RE)) {
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

  return svgText.replace(IMG_HREF_RE, (full, attr: string, href: string) => {
    const uri = uriByHref.get(href);
    return uri ? `${attr}="${uri}"` : full;
  });
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
    if (/^page\d+\.svg$/i.test(relativePath)) {
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

  // Page order + lesson sections from imsmanifest.xml.
  const manifestEntry =
    zip.file('imsmanifest.xml') ?? zip.file(/imsmanifest\.xml$/i)[0] ?? null;
  const plan = manifestEntry
    ? parseManifest(await manifestEntry.async('string'), availablePages)
    : { order: [], sections: [] as NotebookSection[] };

  const orderedNames =
    plan.order.length > 0
      ? plan.order
      : [...availablePages].sort((a, b) => pageNumber(a) - pageNumber(b));

  const entryByName = new Map(pageEntries.map((p) => [p.name, p.obj]));

  // Inline images into each page (shared cache dedupes repeated images).
  const imageLookup = buildImageLookup(zip);
  const imageCache = new Map<string, string>();
  const pages = await Promise.all(
    orderedNames.map(async (name) => {
      const obj = entryByName.get(name);
      if (!obj) throw new Error(`Missing page entry: ${name}`);
      const svgText = await obj.async('string');
      const inlined = await inlinePageImages(
        svgText,
        zip,
        imageLookup,
        imageCache
      );
      return {
        blob: new Blob([ensureSvgNamespaces(inlined)], {
          type: 'image/svg+xml',
        }),
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
