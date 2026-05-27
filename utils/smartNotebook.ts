import JSZip from 'jszip';
import { NotebookSection } from '@/types';

/**
 * Shared building blocks for reading SMART Notebook (.notebook) archives.
 * Used by both the import parser (utils/notebookParser.ts) and the in-app
 * client-side converter (utils/notebookConverter.ts), and mirrored by the
 * Python desktop tool (scripts/smart2spart/smart2spart.py). Keep the three in
 * sync — they all depend on the same SMART format quirks.
 */

/** Matches a top-level SMART page file: page0.svg, page12.svg, … */
export const PAGE_SVG_RE = /^page\d+\.svg$/i;

const PAGE_NUM_RE = /(\d+)/;
export const pageNumber = (name: string): number =>
  parseInt(name.match(PAGE_NUM_RE)?.[0] ?? '0', 10);

export const extensionOf = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.svg')) return 'svg';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  if (lower.endsWith('.gif')) return 'gif';
  if (lower.endsWith('.webp')) return 'webp';
  return 'png';
};

export const imageSubtype = (name: string): string => {
  const ext = extensionOf(name);
  if (ext === 'jpg') return 'jpeg';
  return ext; // png | gif | webp | svg
};

// ---------------------------------------------------------------------------
// SVG namespace repair
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * SMART page SVGs omit the root `xmlns` declaration. They render inline inside
 * SMART, but a standalone SVG loaded via an <img> tag (how the Viewer displays
 * pages) will NOT render without the SVG namespace. Inject it (and xlink, if
 * used) into the opening <svg> tag when missing. Idempotent.
 */
export const ensureSvgNamespaces = (svgText: string): string => {
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

// ---------------------------------------------------------------------------
// Image reference resolution (relative images/* hrefs)
// ---------------------------------------------------------------------------

/** Matches SVG2 `href="images/…"` and legacy `xlink:href="images/…"`. */
export const imageHrefRegex = (): RegExp =>
  /(\bxlink:href|\bhref)\s*=\s*"(images\/[^"]+)"/g;

/** Pull width/height numbers off the root <svg …> tag. */
export const svgDimensions = (
  svgText: string
): { width: number; height: number } => {
  const w = /<svg\b[^>]*\bwidth="([\d.]+)"/.exec(svgText);
  const h = /<svg\b[^>]*\bheight="([\d.]+)"/.exec(svgText);
  return {
    width: w ? Math.round(parseFloat(w[1])) : 800,
    height: h ? Math.round(parseFloat(h[1])) : 600,
  };
};

export const buildImageLookup = (zip: JSZip): Map<string, string> => {
  const lookup = new Map<string, string>();
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) {
      lookup.set(relativePath.replace(/\\/g, '/').toLowerCase(), relativePath);
    }
  });
  return lookup;
};

export const resolveImageKey = (
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

// ---------------------------------------------------------------------------
// SMART shortcut hyperlinks (object → page jumps)
// ---------------------------------------------------------------------------

/**
 * A page-jump link extracted from a SMART page SVG. Target is the original
 * filename (e.g. "page1.svg") because the caller knows the mapping to
 * output page index via its own page-order plan. Box is normalized [0..1]
 * against the page's intrinsic dimensions, captured from the element's
 * un-transformed x/y/width/height (matches v1's "captured at link
 * creation" semantics — rotations on linked elements are rare and we
 * accept slight hotspot misalignment when they occur).
 */
export interface ImportedShortcutLink {
  objectId: string;
  sourcePage: number;
  targetFile: string;
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
}

// Match the opening tag of any element carrying shortcut="page://...".
// Captures: 1=tag name, 2=full attrs (no closing > or />), 3=target filename.
// SMART writes these on <image>, but accepting any tag keeps us robust to
// future format variants.
const SHORTCUT_TAG_RE =
  /<(\w+)\b([^>]*\bshortcut="page:\/\/([^"]+)"[^>]*?)(\/?)>/g;

const attrValue = (attrs: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
};

/**
 * Walk a page SVG, extract every shortcut="page://" element as a link
 * record, and stamp `data-edit-id` on each linked element so the in-editor
 * link FAB can later reconnect to its source object (ensureObjectIds
 * preserves pre-set ids).
 *
 * Returns the mutated SVG and the list of links found. The shortcut /
 * shortcutArea attributes are preserved on the element — they're harmless
 * in browsers (unknown attrs are ignored) and removing them would require
 * a regex pass we don't need for v1.
 */
export const extractShortcutLinks = (
  svgText: string,
  sourcePage: number,
  pageDims: { width: number; height: number }
): { svg: string; links: ImportedShortcutLink[] } => {
  const links: ImportedShortcutLink[] = [];
  if (pageDims.width <= 0 || pageDims.height <= 0) {
    return { svg: svgText, links };
  }
  let counter = 0;
  const mutated = svgText.replace(
    SHORTCUT_TAG_RE,
    (full, tag: string, attrs: string, target: string, selfClose: string) => {
      const x = parseFloat(attrValue(attrs, 'x') ?? 'NaN');
      const y = parseFloat(attrValue(attrs, 'y') ?? 'NaN');
      const w = parseFloat(attrValue(attrs, 'width') ?? 'NaN');
      const h = parseFloat(attrValue(attrs, 'height') ?? 'NaN');
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(w) ||
        !Number.isFinite(h) ||
        w <= 0 ||
        h <= 0
      ) {
        return full;
      }
      // Seed the object id from the SMART xml:id when present — same element
      // re-imported repeatedly keeps a stable id, which means re-importing a
      // notebook doesn't create duplicate orphan links if Firestore links
      // are merged on the destination.
      const xmlId = attrValue(attrs, 'xml:id');
      const objectId = xmlId
        ? `link-${xmlId}`
        : `link-p${sourcePage}-${counter}`;
      counter += 1;
      links.push({
        objectId,
        sourcePage,
        targetFile: target,
        xFrac: x / pageDims.width,
        yFrac: y / pageDims.height,
        wFrac: w / pageDims.width,
        hFrac: h / pageDims.height,
      });
      // Stamp data-edit-id only if absent (idempotent re-runs).
      if (/\bdata-edit-id\s*=/.test(attrs)) return full;
      return `<${tag}${attrs} data-edit-id="${objectId}"${selfClose}>`;
    }
  );
  return { svg: mutated, links };
};

// ---------------------------------------------------------------------------
// Manifest parsing (page order + lesson sections)
// ---------------------------------------------------------------------------

export interface ManifestPlan {
  order: string[];
  sections: NotebookSection[];
}

const orderedFileHrefs = (resource: Element): string[] =>
  Array.from(resource.getElementsByTagNameNS('*', 'file'))
    .map((f) => f.getAttribute('href')?.replace(/\\/g, '/') ?? '')
    .filter((h) => h.toLowerCase().endsWith('.svg'));

/**
 * Derive the true page order and lesson sections from imsmanifest.xml.
 * Preference: lesson groups (order + titles) > flat "pages" resource > numeric
 * filename sort. Orphan pages present on disk but unreferenced are appended so
 * none is ever dropped. `availablePages` filters dangling references.
 */
export const parseManifest = (
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

/** Ordered page-svg entry names from a loaded archive (manifest-aware). */
export const resolvePageOrder = async (
  zip: JSZip,
  availablePages: string[]
): Promise<ManifestPlan> => {
  const manifestEntry =
    zip.file('imsmanifest.xml') ?? zip.file(/imsmanifest\.xml$/i)[0] ?? null;
  const plan = manifestEntry
    ? parseManifest(await manifestEntry.async('string'), availablePages)
    : { order: [], sections: [] as NotebookSection[] };

  if (plan.order.length === 0) {
    plan.order = [...availablePages].sort(
      (a, b) => pageNumber(a) - pageNumber(b)
    );
  }
  return plan;
};
