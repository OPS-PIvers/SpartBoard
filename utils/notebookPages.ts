import { NotebookSection } from '@/types';

/**
 * Pure page-list + lesson-section operations for the SMART Notebook widget
 * (add / delete / reorder pages). Kept separate from Firestore/Storage so the
 * tricky part — keeping the contiguous lesson sections correct as pages move —
 * is fully unit-testable. The Widget applies the result, then persists.
 */

export interface PageListState {
  pageUrls: string[];
  pagePaths: string[];
  sections?: NotebookSection[];
}

const cloneSections = (sections?: NotebookSection[]): NotebookSection[] =>
  (sections ?? []).map((s) => ({ ...s }));

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

  return {
    pageUrls,
    pagePaths,
    sections: state.sections ? sections : undefined,
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

  return {
    state: {
      pageUrls,
      pagePaths,
      sections: state.sections ? sections : undefined,
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
 * (movement is constrained to within a section by `canMovePage`). */
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
  return { pageUrls, pagePaths, sections: state.sections };
};

/** A blank white page SVG (renders via <img> and is editable like any page). */
export const blankPageSvg = (width = 1280, height = 960): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
  `viewBox="0 0 ${width} ${height}">` +
  `<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>` +
  `<g class="foreground"></g></svg>`;
