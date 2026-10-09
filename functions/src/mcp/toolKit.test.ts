import { describe, expect, it } from 'vitest';
import type * as admin from 'firebase-admin';
import {
  FOLDER_COLLECTIONS,
  FOLDER_PAGE_SIZE,
  folderPath,
  loadAllFolders,
  resolveFolderPath,
  toFolderRow,
  type FolderRow,
} from './toolKit';

const rows: FolderRow[] = [
  { id: 'u3', name: 'Unit 3', parentId: null, order: 0, color: null },
  { id: 'w1', name: 'Week 1', parentId: 'u3', order: 0, color: null },
  { id: 'w2', name: 'Week 2', parentId: 'u3', order: 1, color: 'blue' },
  { id: 'w2b', name: 'week 2', parentId: 'u3', order: 2, color: null },
  { id: 'd1', name: 'Day 1', parentId: 'w2', order: 0, color: null },
];
const byId = new Map(rows.map((r) => [r.id, r]));

describe('FOLDER_COLLECTIONS', () => {
  it('covers every folder-enabled library the client stores', () => {
    expect(FOLDER_COLLECTIONS.guided_learning).toBe('guided_learning_folders');
    expect(FOLDER_COLLECTIONS.projects).toBe('projects_folders');
  });
});

describe('toFolderRow', () => {
  it('reads color and defaults missing fields', () => {
    expect(toFolderRow('a', { name: 'A', color: 'teal' })).toEqual({
      id: 'a',
      name: 'A',
      parentId: null,
      order: 0,
      color: 'teal',
    });
    expect(
      toFolderRow('b', { name: 'B', parentId: 'a', color: '' }).color
    ).toBe(null);
  });
});

describe('folderPath', () => {
  it('names every level from the top', () => {
    expect(folderPath('d1', byId)).toEqual(['Unit 3', 'Week 2', 'Day 1']);
    expect(folderPath('u3', byId)).toEqual(['Unit 3']);
  });

  it('stops at a missing parent or a cycle', () => {
    const broken = new Map<string, FolderRow>([
      ['x', { id: 'x', name: 'X', parentId: 'gone', order: 0, color: null }],
      ['a', { id: 'a', name: 'A', parentId: 'b', order: 0, color: null }],
      ['b', { id: 'b', name: 'B', parentId: 'a', order: 0, color: null }],
    ]);
    expect(folderPath('x', broken)).toEqual(['X']);
    expect(folderPath('a', broken)).toEqual(['B', 'A']);
  });
});

describe('resolveFolderPath', () => {
  it('reuses existing folders case-insensitively, lowest order first', () => {
    expect(resolveFolderPath(rows, null, [' unit 3', 'WEEK 2'])).toEqual({
      parentId: 'w2',
      missing: [],
    });
  });

  it('returns the names still to create below the deepest match', () => {
    expect(
      resolveFolderPath(rows, null, ['Unit 3', 'Week 3', 'Day 1'])
    ).toEqual({ parentId: 'u3', missing: ['Week 3', 'Day 1'] });
    expect(resolveFolderPath(rows, null, ['Unit 4'])).toEqual({
      parentId: null,
      missing: ['Unit 4'],
    });
  });

  it('starts from a given parent and never matches across branches', () => {
    expect(resolveFolderPath(rows, 'u3', ['Week 1'])).toEqual({
      parentId: 'w1',
      missing: [],
    });
    expect(resolveFolderPath(rows, 'w1', ['Day 1'])).toEqual({
      parentId: 'w1',
      missing: ['Day 1'],
    });
    expect(resolveFolderPath(rows, 'u3', [])).toEqual({
      parentId: 'u3',
      missing: [],
    });
  });
});

describe('loadAllFolders', () => {
  it('pages past the first page so no folder is missed', async () => {
    const docs = Array.from({ length: FOLDER_PAGE_SIZE + 3 }, (_, i) => ({
      id: `f${String(i).padStart(4, '0')}`,
      data: () => ({ name: `Folder ${i}` }),
    }));
    let reads = 0;
    const query = (start: number) => ({
      orderBy: () => query(start),
      limit: () => query(start),
      startAfter: (last: { id: string }) =>
        query(docs.findIndex((d) => d.id === last.id) + 1),
      get: () => {
        reads += 1;
        return Promise.resolve({
          docs: docs.slice(start, start + FOLDER_PAGE_SIZE),
        });
      },
    });
    const db = { collection: () => query(0) };

    const rows = await loadAllFolders(
      db as unknown as admin.firestore.Firestore,
      'users/u/quiz_folders'
    );
    expect(rows).toHaveLength(FOLDER_PAGE_SIZE + 3);
    expect(rows.at(-1)?.name).toBe(`Folder ${FOLDER_PAGE_SIZE + 2}`);
    expect(reads).toBe(2);
  });
});
