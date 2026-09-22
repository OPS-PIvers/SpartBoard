import { describe, it, expect } from 'vitest';
import { buildSubShareNav, pickLandingBoard } from './subShareNav';

const label = (id: string) => `Board …${id.slice(-4)}`;

const v2 = {
  boardIds: ['b1', 'b2', 'b3'],
  boards: [
    { id: 'b1', name: 'Warm up', sectionId: 'root', order: 0 },
    { id: 'b2', name: 'Reading', sectionId: 'unit-1', order: 0 },
    { id: 'b3', name: 'Exit ticket', sectionId: 'unit-1', order: 1 },
  ],
  sections: [
    { id: 'root', name: '' },
    { id: 'unit-1', name: 'Unit 1' },
  ],
  defaultBoardId: 'b2',
};

describe('buildSubShareNav', () => {
  it('groups the boards by section in tree order', () => {
    const nav = buildSubShareNav(v2, label);
    expect(nav.sections).toEqual([
      { id: 'root', name: '', boards: [{ id: 'b1', name: 'Warm up' }] },
      {
        id: 'unit-1',
        name: 'Unit 1',
        boards: [
          { id: 'b2', name: 'Reading' },
          { id: 'b3', name: 'Exit ticket' },
        ],
      },
    ]);
  });

  it('flattens the groups into the stepping order', () => {
    expect(buildSubShareNav(v2, label).order).toEqual(['b1', 'b2', 'b3']);
  });

  it('carries the teacher-chosen landing board through', () => {
    expect(buildSubShareNav(v2, label).defaultBoardId).toBe('b2');
  });

  it('drops a section with no boards left in it', () => {
    const nav = buildSubShareNav(
      {
        ...v2,
        boardIds: ['b1'],
        boards: v2.boards.slice(0, 1),
      },
      label
    );
    expect(nav.sections.map((s) => s.id)).toEqual(['root']);
  });

  // boardIds is the list that matches the board sub-docs, so a name-only
  // entry for a board that is gone must not become a navigable row.
  it('ignores a named board that is no longer in boardIds', () => {
    const nav = buildSubShareNav({ ...v2, boardIds: ['b1', 'b3'] }, label);
    expect(nav.order).toEqual(['b1', 'b3']);
  });

  it('keeps a board whose section is missing rather than losing it', () => {
    const nav = buildSubShareNav(
      {
        ...v2,
        boards: [
          ...v2.boards,
          { id: 'b4', name: 'Orphan', sectionId: 'gone', order: 0 },
        ],
        boardIds: [...v2.boardIds, 'b4'],
      },
      label
    );
    expect(nav.order).toContain('b4');
    expect(nav.sections[0]?.boards.map((b) => b.id)).toEqual(['b1', 'b4']);
  });

  it('de-duplicates a repeated board id', () => {
    const nav = buildSubShareNav(
      { ...v2, boardIds: ['b1', 'b1', 'b2'] },
      label
    );
    expect(nav.order).toEqual(['b1', 'b2']);
  });

  it('falls back to the recorded label when a name is blank', () => {
    const nav = buildSubShareNav(
      {
        ...v2,
        boards: [{ id: 'b1', name: '   ', sectionId: 'root', order: 0 }],
        boardIds: ['b1'],
      },
      label
    );
    expect(nav.sections[0]?.boards[0]?.name).toBe('Board …b1');
  });

  // Pre-v2 shares carry only boardIds; they still have to navigate.
  it('collapses a pre-v2 share into one unnamed group', () => {
    const nav = buildSubShareNav(
      { boardIds: ['x1', 'x2'], defaultBoardId: undefined } as Parameters<
        typeof buildSubShareNav
      >[0],
      label
    );
    expect(nav.sections).toEqual([
      {
        id: '',
        name: '',
        boards: [
          { id: 'x1', name: 'Board …x1' },
          { id: 'x2', name: 'Board …x2' },
        ],
      },
    ]);
    expect(nav.order).toEqual(['x1', 'x2']);
  });

  it('handles a share with no boards at all', () => {
    const nav = buildSubShareNav(
      { boardIds: [] } as Parameters<typeof buildSubShareNav>[0],
      label
    );
    expect(nav.order).toEqual([]);
  });
});

describe('pickLandingBoard', () => {
  it('prefers the teacher-chosen board', () => {
    expect(pickLandingBoard(['a', 'b'], 'b')).toBe('b');
  });

  it('falls back when that board is gone', () => {
    expect(pickLandingBoard(['a', 'b'], 'removed')).toBe('a');
  });

  it('falls back when none was chosen', () => {
    expect(pickLandingBoard(['a', 'b'], null)).toBe('a');
    expect(pickLandingBoard(['a', 'b'], undefined)).toBe('a');
  });

  it('returns null for an empty share', () => {
    expect(pickLandingBoard([], 'a')).toBeNull();
  });
});
