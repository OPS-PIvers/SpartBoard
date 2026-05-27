import { describe, it, expect } from 'vitest';
import type { DrawingPage, PathObject } from '@/types';
import {
  clampPageIndex,
  deletePage,
  insertBlankPage,
  movePage,
} from '@/components/widgets/DrawingWidget/pageHelpers';

const path = (id: string, z = 0): PathObject => ({
  id,
  kind: 'path',
  z,
  color: '#000',
  width: 4,
  points: [{ x: 0, y: 0 }],
});

const page = (id: string, objs: PathObject[] = []): DrawingPage => ({
  id,
  objects: objs,
});

describe('pageHelpers', () => {
  describe('clampPageIndex', () => {
    it('returns 0 for an empty list', () => {
      expect(clampPageIndex(2, 0)).toBe(0);
    });
    it('returns 0 for negatives', () => {
      expect(clampPageIndex(-3, 5)).toBe(0);
    });
    it('clamps to pageCount-1 for over-range values', () => {
      expect(clampPageIndex(99, 5)).toBe(4);
    });
    it('returns the index when in range', () => {
      expect(clampPageIndex(2, 5)).toBe(2);
    });
    it('handles non-finite inputs', () => {
      expect(clampPageIndex(NaN, 5)).toBe(0);
    });
  });

  describe('insertBlankPage', () => {
    it('appends when afterIndex >= length', () => {
      const pages = [page('a'), page('b')];
      const out = insertBlankPage(pages, 5);
      expect(out).toHaveLength(3);
      expect(out[0].id).toBe('a');
      expect(out[1].id).toBe('b');
      expect(out[2].objects).toEqual([]);
      expect(out[2].id).not.toBe('');
    });
    it('inserts at the start when afterIndex < 0', () => {
      const pages = [page('a')];
      const out = insertBlankPage(pages, -2);
      expect(out).toHaveLength(2);
      expect(out[1].id).toBe('a');
    });
    it('inserts immediately after the given index', () => {
      const pages = [page('a'), page('b'), page('c')];
      const out = insertBlankPage(pages, 0);
      expect(out.map((p) => p.id)).toEqual(['a', expect.any(String), 'b', 'c']);
    });
    it('does not mutate the input', () => {
      const pages = [page('a')];
      const out = insertBlankPage(pages, 0);
      expect(pages).toHaveLength(1);
      expect(out).not.toBe(pages);
    });
  });

  describe('deletePage', () => {
    it('removes the page at the index and returns its objects', () => {
      const pages = [page('a', [path('o1')]), page('b'), page('c')];
      const { pages: out, removedObjects } = deletePage(pages, 0);
      expect(out).toHaveLength(2);
      expect(out.map((p) => p.id)).toEqual(['b', 'c']);
      expect(removedObjects).toHaveLength(1);
      expect(removedObjects[0].id).toBe('o1');
    });
    it('replaces a deleted last page with a fresh empty page (never zero)', () => {
      const lone = page('only', [path('o1')]);
      const { pages: out, removedObjects } = deletePage([lone], 0);
      expect(out).toHaveLength(1);
      expect(out[0].id).not.toBe('only');
      expect(out[0].objects).toEqual([]);
      expect(removedObjects).toHaveLength(1);
    });
    it('no-ops on out-of-range indices', () => {
      const pages = [page('a'), page('b')];
      const out = deletePage(pages, 9);
      expect(out.pages).toHaveLength(2);
      expect(out.pages.map((p) => p.id)).toEqual(['a', 'b']);
      expect(out.removedObjects).toEqual([]);
    });
  });

  describe('movePage', () => {
    it('moves the page at `from` to position `to` preserving ids', () => {
      const pageA = page('a');
      const pageB = page('b');
      const pageC = page('c');
      const pages = [pageA, pageB, pageC];
      const out = movePage(pages, 0, 2);
      expect(out.map((p) => p.id)).toEqual(['b', 'c', 'a']);
      // Stronger assertion: each moved page's id must be the SAME string
      // we started with — a regression that regenerated UUIDs during reorder
      // would still produce ['b','c','a'] ordering but break per-id state
      // (e.g. the command stack keyed by page id).
      expect(out[0].id).toBe(pageB.id);
      expect(out[1].id).toBe(pageC.id);
      expect(out[2].id).toBe(pageA.id);
    });
    it('preserves per-page background across reorders', () => {
      const pages: DrawingPage[] = [
        { id: 'a', objects: [], background: 'grid' },
        { id: 'b', objects: [] },
      ];
      const out = movePage(pages, 0, 1);
      expect(out[1].background).toBe('grid');
    });
    it('returns a fresh array even on a no-op', () => {
      const pages = [page('a'), page('b')];
      const out = movePage(pages, 0, 0);
      expect(out).not.toBe(pages);
      expect(out.map((p) => p.id)).toEqual(['a', 'b']);
    });
    it('no-ops on out-of-range indices', () => {
      const pages = [page('a')];
      expect(movePage(pages, 0, 5).map((p) => p.id)).toEqual(['a']);
      expect(movePage(pages, 5, 0).map((p) => p.id)).toEqual(['a']);
    });
  });
});
