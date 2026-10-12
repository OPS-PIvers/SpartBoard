import { describe, expect, it, vi } from 'vitest';
import type { LibraryFolder, QuestionBankMetadata } from '@/types';
import {
  copyBankFoldersToLibrary,
  pendingBankCopies,
} from './useCopyBankFoldersToLibrary';

const folder = (
  id: string,
  name: string,
  parentId: string | null = null
): LibraryFolder => ({ id, name, parentId, order: 0, createdAt: 1 });

const bank = (
  id: string,
  extra: Partial<QuestionBankMetadata> = {}
): QuestionBankMetadata => ({
  id,
  title: id,
  driveFileId: `d-${id}`,
  questionCount: 1,
  targetIds: [],
  targetCounts: {},
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('copyBankFoldersToLibrary', () => {
  const bankFolders = [
    folder('bf-1', 'Unit 1'),
    folder('bf-2', 'Unit 2'),
    folder('bf-3', 'Week 1', 'bf-2'),
  ];

  it('only copies banks that sit in a bank folder and were never filed', () => {
    const banks = [
      bank('a', { folderId: 'bf-1' }),
      bank('b', { folderId: 'bf-1', libraryFolderId: null }),
      bank('c'),
      bank('d', { folderId: 'gone' }),
    ];
    expect(pendingBankCopies(banks, bankFolders).map((b) => b.id)).toEqual([
      'a',
    ]);
  });

  it('reuses a same-named Quiz folder and recreates the rest with nesting', async () => {
    let n = 0;
    const createFolder = vi.fn((): Promise<string> =>
      Promise.resolve(`new-${n++}`)
    );
    const move = vi.fn((): Promise<void> => Promise.resolve());
    await copyBankFoldersToLibrary(
      [
        bank('a', { folderId: 'bf-1' }),
        bank('b', { folderId: 'bf-3' }),
        bank('c', { folderId: 'bf-2' }),
      ],
      bankFolders,
      [folder('qf-1', 'Unit 1')],
      createFolder,
      move
    );
    expect(createFolder.mock.calls).toEqual([
      ['Unit 2', null],
      ['Week 1', 'new-0'],
    ]);
    expect(move.mock.calls).toEqual([
      ['a', 'qf-1'],
      ['b', 'new-1'],
      ['c', 'new-0'],
    ]);
  });
});
