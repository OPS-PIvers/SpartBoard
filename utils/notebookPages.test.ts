import { describe, it, expect } from 'vitest';
import {
  insertBlankPage,
  deletePage,
  canMovePage,
  movePage,
  sectionIndexOfPage,
  clampPageIndex,
  blankPageSvg,
  PageListState,
} from './notebookPages';
import { NotebookObjectLink } from '@/types';

const link = (
  id: string,
  objectId: string,
  sourcePage: number,
  targetPage: number
): NotebookObjectLink => ({
  id,
  objectId,
  sourcePage,
  targetPage,
  xFrac: 0,
  yFrac: 0,
  wFrac: 0.1,
  hFrac: 0.1,
});

// Pages p0..p4 across two lessons: A=[0,1,2], B=[3,4].
const state = (): PageListState => ({
  pageUrls: ['u0', 'u1', 'u2', 'u3', 'u4'],
  pagePaths: ['p0', 'p1', 'p2', 'p3', 'p4'],
  sections: [
    { title: 'A', startIndex: 0, pageCount: 3 },
    { title: 'B', startIndex: 3, pageCount: 2 },
  ],
});

describe('insertBlankPage', () => {
  it('inserts within a section and grows it; later sections shift', () => {
    const next = insertBlankPage(state(), 1, 'NEW', 'NEWP');
    expect(next.pageUrls).toEqual(['u0', 'u1', 'NEW', 'u2', 'u3', 'u4']);
    expect(next.sections).toEqual([
      { title: 'A', startIndex: 0, pageCount: 4 },
      { title: 'B', startIndex: 4, pageCount: 2 },
    ]);
  });

  it('inserting after the last page of a section appends to that section', () => {
    const next = insertBlankPage(state(), 2, 'NEW', 'NEWP'); // after p2 (end of A)
    expect(next.pageUrls[3]).toBe('NEW');
    expect(next.sections?.[0]).toEqual({
      title: 'A',
      startIndex: 0,
      pageCount: 4,
    });
    expect(next.sections?.[1]).toEqual({
      title: 'B',
      startIndex: 4,
      pageCount: 2,
    });
  });

  it('works without sections', () => {
    const next = insertBlankPage(
      { pageUrls: ['a', 'b'], pagePaths: ['x', 'y'] },
      0,
      'NEW',
      'NEWP'
    );
    expect(next.pageUrls).toEqual(['a', 'NEW', 'b']);
    expect(next.sections).toBeUndefined();
  });

  it('appending after the very last page grows the last section', () => {
    const next = insertBlankPage(state(), 4, 'NEW', 'NEWP'); // after last page (end of B)
    expect(next.pageUrls[5]).toBe('NEW');
    expect(next.sections).toEqual([
      { title: 'A', startIndex: 0, pageCount: 3 },
      { title: 'B', startIndex: 3, pageCount: 3 },
    ]);
  });

  it('inserting before the first page shifts the first section', () => {
    const next = insertBlankPage(state(), -1, 'NEW', 'NEWP'); // insertAt clamps to 0
    expect(next.pageUrls[0]).toBe('NEW');
    expect(next.sections).toEqual([
      { title: 'A', startIndex: 1, pageCount: 3 },
      { title: 'B', startIndex: 4, pageCount: 2 },
    ]);
  });
});

describe('deletePage', () => {
  it('removes from its section and shifts later sections', () => {
    const { state: next, removedPath } = deletePage(state(), 1);
    expect(removedPath).toBe('p1');
    expect(next.pageUrls).toEqual(['u0', 'u2', 'u3', 'u4']);
    expect(next.sections).toEqual([
      { title: 'A', startIndex: 0, pageCount: 2 },
      { title: 'B', startIndex: 2, pageCount: 2 },
    ]);
  });

  it('deletes the first page (start of section A)', () => {
    const { state: next } = deletePage(state(), 0);
    expect(next.pageUrls).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(next.sections).toEqual([
      { title: 'A', startIndex: 0, pageCount: 2 },
      { title: 'B', startIndex: 2, pageCount: 2 },
    ]);
  });

  it('deletes the first page of a later section (start of B)', () => {
    const { state: next, removedPath } = deletePage(state(), 3);
    expect(removedPath).toBe('p3');
    expect(next.pageUrls).toEqual(['u0', 'u1', 'u2', 'u4']);
    expect(next.sections).toEqual([
      { title: 'A', startIndex: 0, pageCount: 3 },
      { title: 'B', startIndex: 3, pageCount: 1 },
    ]);
  });

  it('is a no-op for an out-of-range index', () => {
    const { state: next, removedPath } = deletePage(state(), 99);
    expect(removedPath).toBeUndefined();
    expect(next.pageUrls).toEqual(state().pageUrls);
  });

  it('drops a section that becomes empty', () => {
    let s = state();
    // delete both B pages (indices 3 then 3)
    s = deletePage(s, 3).state;
    s = deletePage(s, 3).state;
    expect(s.pageUrls).toEqual(['u0', 'u1', 'u2']);
    expect(s.sections).toEqual([{ title: 'A', startIndex: 0, pageCount: 3 }]);
  });
});

describe('canMovePage / movePage', () => {
  it('allows moves within a section', () => {
    expect(canMovePage(state(), 0, 1)).toBe(true); // p0->p1 (both A)
    const next = movePage(state(), 0, 1);
    expect(next.pageUrls).toEqual(['u1', 'u0', 'u2', 'u3', 'u4']);
    expect(next.sections).toEqual(state().sections); // unchanged
  });

  it('blocks moves across a section boundary', () => {
    expect(canMovePage(state(), 2, 1)).toBe(false); // p2 (A) -> p3 (B)
    expect(movePage(state(), 2, 1)).toEqual(state()); // no-op
  });

  it('blocks moves out of bounds', () => {
    expect(canMovePage(state(), 0, -1)).toBe(false);
    expect(canMovePage(state(), 4, 1)).toBe(false);
  });
});

describe('objectLinks rewrite', () => {
  const withLinks = (): PageListState => ({
    ...state(),
    objectLinks: [
      link('L0', 'obj0', 0, 4), // p0 → p4
      link('L1', 'obj1', 2, 0), // p2 → p0
      link('L2', 'obj2', 3, 3), // p3 → p3 (same-page link)
    ],
  });

  it('insertBlankPage shifts link indices at or after the insert point', () => {
    // Insert after index 1 -> insertAt = 2. Pages 2,3,4 shift to 3,4,5.
    const next = insertBlankPage(withLinks(), 1, 'NEW', 'NEWP');
    expect(next.objectLinks).toEqual([
      link('L0', 'obj0', 0, 5), // target 4 -> 5
      link('L1', 'obj1', 3, 0), // source 2 -> 3
      link('L2', 'obj2', 4, 4), // source 3 -> 4, target 3 -> 4
    ]);
  });

  it('insertBlankPage leaves links untouched when inserting after them all', () => {
    // Insert after index 4 -> insertAt = 5, past every page.
    const next = insertBlankPage(withLinks(), 4, 'NEW', 'NEWP');
    expect(next.objectLinks).toEqual(withLinks().objectLinks);
  });

  it('deletePage drops links whose source page is deleted', () => {
    const { state: next } = deletePage(withLinks(), 0);
    // L0 (sourcePage 0) and L1 (targetPage 0) are both gone.
    // L2 survives: 3 -> 2 (both indices shift left).
    expect(next.objectLinks).toEqual([link('L2', 'obj2', 2, 2)]);
  });

  it('deletePage drops links whose target page is deleted', () => {
    const { state: next } = deletePage(withLinks(), 4);
    // L0 targeted page 4 -> dropped. L1 (2->0) survives unchanged.
    // L2 (3->3) survives unchanged (both < 4).
    expect(next.objectLinks).toEqual([
      link('L1', 'obj1', 2, 0),
      link('L2', 'obj2', 3, 3),
    ]);
  });

  it('movePage swaps page indices on both source and target of every link', () => {
    // Move p2 left to p1 (both in section A). Indices 1 and 2 swap.
    const next = movePage(withLinks(), 2, -1);
    expect(next.objectLinks).toEqual([
      link('L0', 'obj0', 0, 4), // unaffected
      link('L1', 'obj1', 1, 0), // source 2 -> 1
      link('L2', 'obj2', 3, 3), // unaffected
    ]);
  });

  it('movePage with no objectLinks leaves the field undefined', () => {
    const next = movePage(state(), 0, 1);
    expect(next.objectLinks).toBeUndefined();
  });
});

describe('helpers', () => {
  it('sectionIndexOfPage finds the owning lesson', () => {
    expect(sectionIndexOfPage(state().sections, 2)).toBe(0);
    expect(sectionIndexOfPage(state().sections, 3)).toBe(1);
  });

  it('blankPageSvg is a valid white page with a foreground group', () => {
    const svg = blankPageSvg(800, 600);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toContain('class="foreground"');
  });

  it('clampPageIndex keeps the index in range', () => {
    expect(clampPageIndex(2, 5)).toBe(2); // already valid
    expect(clampPageIndex(7, 5)).toBe(4); // past the end -> last
    expect(clampPageIndex(0, 0)).toBe(0); // empty notebook
    expect(clampPageIndex(3, 0)).toBe(0); // empty notebook, stale index
    expect(clampPageIndex(-1, 5)).toBe(0); // negative -> 0
    expect(clampPageIndex(4, 5)).toBe(4); // last page (delete-last case)
  });
});
