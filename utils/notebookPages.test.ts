import { describe, it, expect } from 'vitest';
import {
  insertBlankPage,
  deletePage,
  canMovePage,
  movePage,
  sectionIndexOfPage,
  blankPageSvg,
  PageListState,
} from './notebookPages';

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
});
