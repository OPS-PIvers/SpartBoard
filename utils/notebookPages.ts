import { NotebookObjectLink, NotebookSection } from '@/types';

/**
 * Pure page-list + lesson-section operations for the SMART Notebook widget
 * (add / delete / reorder pages). Kept separate from Firestore/Storage so the
 * tricky parts — keeping the contiguous lesson sections correct AND rewriting
 * objectLinks' page indices as pages move — are fully unit-testable. The
 * Widget applies the result, then persists.
 */

export interface PageListState {
  pageUrls: string[];
  pagePaths: string[];
  sections?: NotebookSection[];
  /**
   * Object→page hyperlinks. Stored on PageListState (rather than passed in
   * separately) so the three structural operations can keep the link
   * sourcePage/targetPage indices coherent in a single pass alongside
   * pageUrls and sections.
   */
  objectLinks?: NotebookObjectLink[];
  /**
   * 0-based indices of pages hidden from presenting (teacher answer keys, or
   * pages carrying myViewBoard's `is-hidden` flag). Sorted, deduped and in
   * range; absent/empty means nothing is hidden.
   */
  hiddenPages?: number[];
}

const cloneSections = (sections?: NotebookSection[]): NotebookSection[] =>
  (sections ?? []).map((s) => ({ ...s }));

/**
 * Apply a per-page-index transform to every link's sourcePage and targetPage.
 * Returning `null` for a given index drops any link that touches it (used by
 * deletePage to discard links whose source page or target page is gone).
 */
const remapLinkPages = (
  links: NotebookObjectLink[] | undefined,
  remap: (page: number) => number | null
): NotebookObjectLink[] | undefined => {
  if (!links) return links;
  const next: NotebookObjectLink[] = [];
  for (const link of links) {
    const source = remap(link.sourcePage);
    const target = remap(link.targetPage);
    if (source === null || target === null) continue;
    next.push({ ...link, sourcePage: source, targetPage: target });
  }
  return next;
};

/** Sort, dedupe and drop out-of-range entries from a hidden-page list. */
export const normalizeHiddenPages = (
  pages: number[] | undefined,
  pageCount: number
): number[] =>
  Array.from(new Set(pages ?? []))
    .filter((p) => Number.isInteger(p) && p >= 0 && p < pageCount)
    .sort((a, b) => a - b);

/**
 * Apply a per-page-index transform to a hidden-page list, dropping indices the
 * transform maps to `null` (the page itself was deleted).
 */
const remapHiddenPages = (
  hidden: number[] | undefined,
  remap: (page: number) => number | null
): number[] | undefined => {
  if (!hidden) return hidden;
  const next: number[] = [];
  for (const page of hidden) {
    const mapped = remap(page);
    if (mapped !== null) next.push(mapped);
  }
  return next.sort((a, b) => a - b);
};

/** Toggle page `index` in a hidden-page list; returns the new sorted list. */
export const toggleHiddenPage = (
  hidden: number[] | undefined,
  index: number
): number[] => {
  const current = hidden ?? [];
  return current.includes(index)
    ? current.filter((p) => p !== index).sort((a, b) => a - b)
    : [...current, index].sort((a, b) => a - b);
};

/**
 * The hidden set the Viewer should actually honour. If every page is hidden
 * we honour none, so the teacher never faces a blank viewer.
 */
export const effectiveHiddenPages = (
  hidden: number[] | undefined,
  pageCount: number
): number[] => {
  const normalized = normalizeHiddenPages(hidden, pageCount);
  return normalized.length >= pageCount ? [] : normalized;
};

/** Visible (non-hidden) page indices, in order. Never empty for a non-empty notebook. */
export const visiblePageIndices = (
  pageCount: number,
  hidden: number[] | undefined
): number[] => {
  const effective = new Set(effectiveHiddenPages(hidden, pageCount));
  return Array.from({ length: pageCount }, (_, i) => i).filter(
    (i) => !effective.has(i)
  );
};

/**
 * 1-based position of `page` among the visible pages. A hidden page (opened
 * deliberately from the jump menu) reports the position of the last visible
 * page before it, so the counter never jumps backwards mid-deck.
 */
export const visiblePositionOf = (
  page: number,
  pageCount: number,
  hidden: number[] | undefined
): number => {
  const visible = visiblePageIndices(pageCount, hidden);
  const exact = visible.indexOf(page);
  if (exact >= 0) return exact + 1;
  const before = visible.filter((p) => p < page).length;
  return Math.max(1, before);
};

/**
 * Next visible page in direction `dir` from `page`, or null when there is
 * none (used to disable prev/next). Works from a hidden page too, so stepping
 * off a deliberately-opened answer key lands on the adjacent visible page.
 */
export const nextVisiblePage = (
  page: number,
  dir: -1 | 1,
  pageCount: number,
  hidden: number[] | undefined
): number | null => {
  const effective = new Set(effectiveHiddenPages(hidden, pageCount));
  for (let p = page + dir; p >= 0 && p < pageCount; p += dir) {
    if (!effective.has(p)) return p;
  }
  return null;
};

/**
 * Clamp a current page index to a (possibly changed) page count. Guards the
 * "blank page / out-of-range" class of bugs after a delete or notebook switch.
 */
export const clampPageIndex = (current: number, pageCount: number): number => {
  if (pageCount <= 0) return 0;
  if (current < 0) return 0;
  return Math.min(current, pageCount - 1);
};

/** Index of the section that owns page `i`, or -1. */
export const sectionIndexOfPage = (
  sections: NotebookSection[] | undefined,
  i: number
): number =>
  (sections ?? []).findIndex(
    (s) => i >= s.startIndex && i < s.startIndex + s.pageCount
  );

/**
 * Insert a blank page immediately after `afterIndex`. The new page joins the
 * section of the page it follows; later sections shift right.
 */
export const insertBlankPage = (
  state: PageListState,
  afterIndex: number,
  url: string,
  path: string
): PageListState => {
  const insertAt = Math.min(Math.max(afterIndex + 1, 0), state.pageUrls.length);
  const pageUrls = [...state.pageUrls];
  const pagePaths = [...state.pagePaths];
  pageUrls.splice(insertAt, 0, url);
  pagePaths.splice(insertAt, 0, path);

  const sections = cloneSections(state.sections).map((s) => {
    if (insertAt <= s.startIndex) return { ...s, startIndex: s.startIndex + 1 };
    if (insertAt <= s.startIndex + s.pageCount)
      return { ...s, pageCount: s.pageCount + 1 };
    return s;
  });

  // Any page at or after the insertion point shifts right by one.
  const objectLinks = remapLinkPages(state.objectLinks, (p) =>
    p >= insertAt ? p + 1 : p
  );
  const hiddenPages = remapHiddenPages(state.hiddenPages, (p) =>
    p >= insertAt ? p + 1 : p
  );

  return {
    pageUrls,
    pagePaths,
    sections: state.sections ? sections : undefined,
    objectLinks,
    hiddenPages,
  };
};

/** Remove the page at `index`; returns the new state + the removed storage path. */
export const deletePage = (
  state: PageListState,
  index: number
): { state: PageListState; removedPath?: string } => {
  if (index < 0 || index >= state.pageUrls.length) return { state };
  const removedPath = state.pagePaths[index];
  const pageUrls = state.pageUrls.filter((_, i) => i !== index);
  const pagePaths = state.pagePaths.filter((_, i) => i !== index);

  const sections = cloneSections(state.sections)
    .map((s) => {
      if (index < s.startIndex) return { ...s, startIndex: s.startIndex - 1 };
      if (index < s.startIndex + s.pageCount)
        return { ...s, pageCount: s.pageCount - 1 };
      return s;
    })
    .filter((s) => s.pageCount > 0);

  // Links whose source page or target page is the deleted page are dropped
  // (the source object is gone with the page, and a hotspot to a missing
  // page would jump to nothing). Surviving links pointing past `index`
  // shift left by one.
  const objectLinks = remapLinkPages(state.objectLinks, (p) => {
    if (p === index) return null;
    return p > index ? p - 1 : p;
  });
  const hiddenPages = remapHiddenPages(state.hiddenPages, (p) => {
    if (p === index) return null;
    return p > index ? p - 1 : p;
  });

  return {
    state: {
      pageUrls,
      pagePaths,
      sections: state.sections ? sections : undefined,
      objectLinks,
      hiddenPages,
    },
    removedPath,
  };
};

/**
 * Whether page `index` can move by `dir` (-1 up / +1 down). To keep lessons
 * contiguous, a page only reorders within its own section (no section grouping
 * ⇒ any in-bounds move is allowed).
 */
export const canMovePage = (
  state: PageListState,
  index: number,
  dir: -1 | 1
): boolean => {
  const target = index + dir;
  if (target < 0 || target >= state.pageUrls.length) return false;
  if (!state.sections || state.sections.length === 0) return true;
  return (
    sectionIndexOfPage(state.sections, index) ===
    sectionIndexOfPage(state.sections, target)
  );
};

/** Swap page `index` with its neighbor in `dir`. Sections are unchanged
 * (movement is constrained to within a section by `canMovePage`). Links
 * on either swapped page have their source/target indices swapped in
 * lockstep so they keep pointing at the same page content. */
export const movePage = (
  state: PageListState,
  index: number,
  dir: -1 | 1
): PageListState => {
  if (!canMovePage(state, index, dir)) return state;
  const target = index + dir;
  const pageUrls = [...state.pageUrls];
  const pagePaths = [...state.pagePaths];
  [pageUrls[index], pageUrls[target]] = [pageUrls[target], pageUrls[index]];
  [pagePaths[index], pagePaths[target]] = [pagePaths[target], pagePaths[index]];

  const swap = (p: number): number =>
    p === index ? target : p === target ? index : p;
  const objectLinks = remapLinkPages(state.objectLinks, swap);
  const hiddenPages = remapHiddenPages(state.hiddenPages, swap);

  return {
    pageUrls,
    pagePaths,
    sections: state.sections,
    objectLinks,
    hiddenPages,
  };
};

/** A blank white page SVG (renders via <img> and is editable like any page). */
export const blankPageSvg = (width = 1280, height = 960): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
  `viewBox="0 0 ${width} ${height}">` +
  `<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>` +
  `<g class="foreground"></g></svg>`;
