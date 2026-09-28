// Planning a bulk bank import: duplicates, empty banks, and folder reuse.

import { describe, it, expect, vi } from 'vitest';
import type { LibraryFolder, QuestionBankMetadata } from '@/types';
import type { CartridgeBank } from '@/utils/quizDocumentImport';
import {
  ensureFolderPath,
  folderNames,
  initiallyChecked,
  planBankImport,
  runPool,
} from '@/utils/cartridgeBankImport';

const folder = (
  id: string,
  name: string,
  parentId: string | null
): LibraryFolder => ({ id, name, parentId, order: 0, createdAt: 0 });

const bank = (
  id: string,
  title: string,
  folderPath: string[],
  count = 1
): CartridgeBank => ({
  id,
  title,
  folderPath,
  images: [],
  questions: Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    text: `Q${i + 1}`,
    type: 'MC' as const,
    options: [],
    correctAnswer: 'A',
    imageIds: [],
    warnings: [],
  })),
});

const meta = (title: string, folderId?: string): QuestionBankMetadata =>
  ({
    id: title,
    title,
    driveFileId: 'd',
    questionCount: 1,
    targetIds: [],
    targetCounts: {},
    createdAt: 0,
    updatedAt: 0,
    ...(folderId ? { folderId } : {}),
  }) as QuestionBankMetadata;

const FOLDERS = [
  folder('root', 'World History Tests', null),
  folder('u2', 'Unit 2', 'root'),
];

describe('folderNames', () => {
  it('walks up to the library root', () => {
    expect(folderNames('u2', FOLDERS)).toEqual([
      'World History Tests',
      'Unit 2',
    ]);
    expect(folderNames(undefined, FOLDERS)).toEqual([]);
  });

  it('stops on a parent cycle', () => {
    const loop = [folder('a', 'A', 'b'), folder('b', 'B', 'a')];
    expect(folderNames('a', loop)).toEqual(['B', 'A']);
  });
});

describe('planBankImport', () => {
  const banks = [
    bank('b1', 'Greece', ['Unit 2']),
    bank('b2', 'Greece', ['Unit 2', 'MCQ M']),
    bank('b3', 'Matching', ['Unit 2'], 0),
  ];

  it('marks a same-titled bank in the same folder as a duplicate, not one elsewhere', () => {
    const rows = planBankImport(
      banks,
      'World History Tests',
      [meta('greece', 'u2'), meta('Greece')],
      FOLDERS
    );
    expect(rows.map((r) => r.duplicate)).toEqual([true, false, false]);
    expect(rows[1].path).toEqual(['World History Tests', 'Unit 2', 'MCQ M']);
  });

  it('starts empty banks and duplicates unticked', () => {
    const rows = planBankImport(
      banks,
      'World History Tests',
      [meta('Greece', 'u2')],
      FOLDERS
    );
    expect(rows[2].empty).toBe(true);
    expect([...initiallyChecked(rows)]).toEqual(['b2']);
  });

  it('follows a renamed collection folder', () => {
    const rows = planBankImport(
      banks,
      'Renamed',
      [meta('Greece', 'u2')],
      FOLDERS
    );
    expect(rows[0].duplicate).toBe(false);
  });
});

describe('ensureFolderPath', () => {
  it('reuses existing folders by name and creates the rest once', async () => {
    let n = 0;
    const createFolder = vi.fn(() => Promise.resolve(`new${++n}`));
    const made = new Map<string, string>();
    const path = ['world history tests', 'Unit 2', 'MCQ M'];
    expect(await ensureFolderPath(path, FOLDERS, createFolder, made)).toBe(
      'new1'
    );
    expect(createFolder).toHaveBeenCalledWith('MCQ M', 'u2');
    expect(await ensureFolderPath(path, FOLDERS, createFolder, made)).toBe(
      'new1'
    );
    expect(createFolder).toHaveBeenCalledTimes(1);
  });
});

describe('runPool', () => {
  it('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (i) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      done.push(i);
    });
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
