import { useCallback } from 'react';
import { DrawableObject, DrawingConfig, DrawingPage } from '@/types';
import {
  clampPageIndex,
  deletePage,
  insertBlankPage,
  movePage,
} from './pageHelpers';

interface UseDrawingPagesOptions {
  /**
   * Migrated DrawingConfig. The caller is responsible for running
   * `migrateDrawingConfig` upstream — this hook assumes `pages` is present
   * and non-empty. (See `Widget.tsx` for the standard pattern.)
   */
  config: DrawingConfig & { pages: DrawingPage[]; currentPage: number };
  /** Persistence sink — receives a partial DrawingConfig (`pages` and/or
   *  `currentPage`) to merge into `updateWidget`. */
  updateConfig: (next: Partial<DrawingConfig>) => void;
  /** Optional callback fired with each removed page's id so callers can
   *  dispose per-page state (e.g. the command stack keyed by page id).
   *  Invoked synchronously inside `removePage`. */
  onPageRemoved?: (pageId: string) => void;
}

interface UseDrawingPagesResult {
  pages: DrawingPage[];
  currentPage: number;
  goToPage: (index: number) => void;
  addPage: () => void;
  removePage: (index: number) => void;
  movePageLeft: (index: number) => void;
  movePageRight: (index: number) => void;
}

/**
 * Page-management hook for the DrawingWidget. Wraps the pure helpers in
 * `pageHelpers.ts` with the clamp + persistence boilerplate the Widget would
 * otherwise repeat at each call site.
 *
 * Notes:
 *  - All mutators write through `updateConfig` (a single `updateWidget`
 *    equivalent) so the page-strip UI plays well with Firestore's debounce.
 *  - `addPage` inserts AFTER the current page and immediately navigates to
 *    the new page (matches Jamboard / Miro / SMART Notebook behavior).
 *  - `removePage` clamps `currentPage` post-deletion so the active index
 *    survives a delete-from-the-right.
 *  - `movePageLeft` / `movePageRight` follow the moved page (so the user's
 *    selected page travels with them).
 */
export const useDrawingPages = ({
  config,
  updateConfig,
  onPageRemoved,
}: UseDrawingPagesOptions): UseDrawingPagesResult => {
  const pages = config.pages;
  const currentPage = clampPageIndex(config.currentPage, pages.length);

  const goToPage = useCallback(
    (index: number) => {
      const next = clampPageIndex(index, pages.length);
      if (next === currentPage) return;
      updateConfig({ currentPage: next });
    },
    [pages.length, currentPage, updateConfig]
  );

  const addPage = useCallback(() => {
    const nextPages = insertBlankPage(pages, currentPage);
    // The new page sits at currentPage + 1.
    updateConfig({ pages: nextPages, currentPage: currentPage + 1 });
  }, [pages, currentPage, updateConfig]);

  const removePage = useCallback(
    (index: number) => {
      if (index < 0 || index >= pages.length) return;
      const removedId = pages[index].id;
      const { pages: nextPages } = deletePage(pages, index);
      // If deleting before/at currentPage, shift current left (but never
      // below 0). If after, currentPage is unchanged.
      let nextCurrent = currentPage;
      if (index < currentPage) nextCurrent = currentPage - 1;
      else if (index === currentPage)
        nextCurrent = Math.min(index, nextPages.length - 1);
      nextCurrent = clampPageIndex(nextCurrent, nextPages.length);
      updateConfig({ pages: nextPages, currentPage: nextCurrent });
      onPageRemoved?.(removedId);
    },
    [pages, currentPage, updateConfig, onPageRemoved]
  );

  const movePageLeft = useCallback(
    (index: number) => {
      if (index <= 0 || index >= pages.length) return;
      const nextPages = movePage(pages, index, index - 1);
      // Follow the moved page so the user's selection stays with it.
      const nextCurrent =
        currentPage === index
          ? index - 1
          : currentPage === index - 1
            ? index
            : currentPage;
      updateConfig({ pages: nextPages, currentPage: nextCurrent });
    },
    [pages, currentPage, updateConfig]
  );

  const movePageRight = useCallback(
    (index: number) => {
      if (index < 0 || index >= pages.length - 1) return;
      const nextPages = movePage(pages, index, index + 1);
      const nextCurrent =
        currentPage === index
          ? index + 1
          : currentPage === index + 1
            ? index
            : currentPage;
      updateConfig({ pages: nextPages, currentPage: nextCurrent });
    },
    [pages, currentPage, updateConfig]
  );

  // No `useMemo` wrapper — its deps include `pages` and `currentPage`,
  // which change on every meaningful config update, so the memo would
  // invalidate on the same cadence as its inputs. Returning a fresh object
  // each render is identical in observable behavior and avoids the dead
  // memo allocation.
  return {
    pages,
    currentPage,
    goToPage,
    addPage,
    removePage,
    movePageLeft,
    movePageRight,
  };
};

// Re-export pure helpers for direct test consumption.
export type { DrawableObject };
