import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

// Board collections and library folders share one folder system; this fails when a copy of one of its pieces comes back.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });

const files = ['components', 'hooks', 'utils', 'context']
  .flatMap((d) => walk(resolve(repoRoot, d)))
  .map((f) => relative(repoRoot, f).replace(/\\/g, '/'))
  .filter((f) => !f.startsWith('components/dev/'));
const read = (f: string) => readFileSync(resolve(repoRoot, f), 'utf8');

const FOLDER_UI = files.filter(
  (f) =>
    f.startsWith('components/boardsModal/') ||
    f.startsWith('components/common/library/') ||
    f === 'components/layout/MoveBoardMenu.tsx' ||
    f === 'components/layout/CollectionSwitcherMenu.tsx'
);

describe('one folder system for boards and libraries', () => {
  it('flattens folder trees only through utils/folderTree.ts', () => {
    const copies = files.filter(
      (f) =>
        f !== 'utils/folderTree.ts' &&
        /walk\(\s*null\s*,\s*0\s*\)/.test(read(f))
    );
    expect(
      copies,
      'Use flattenTree / collectDescendantIds from utils/folderTree.ts instead of a hand-written tree walk.'
    ).toEqual([]);
  });

  it('picks folder colours only from the shared palette', () => {
    const custom = FOLDER_UI.filter((f) => /type=["']color["']/.test(read(f)));
    expect(
      custom,
      'Folder and collection colours come from FOLDER_COLORS (components/common/library/folderColors.ts) through FolderColorPicker.'
    ).toEqual([]);
  });

  it('names, moves and deletes folders with the shared pieces', () => {
    const boards = read('components/boardsModal/BoardsModal.tsx');
    expect(boards).toMatch(/<FolderPickerPopover\b/);
    expect(boards).toMatch(/<DeleteFolderDialog\b/);
    expect(boards).not.toMatch(/newCollectionPrompt|Rename Collection'/);
    for (const gone of [
      'components/boardsModal/MoveToCollectionMenu.tsx',
      'components/boardsModal/CollectionColorPicker.tsx',
    ]) {
      expect(existsSync(resolve(repoRoot, gone)), gone).toBe(false);
    }
    const ownDeleteDialogs = FOLDER_UI.filter(
      (f) =>
        f !== 'components/common/library/DeleteFolderDialog.tsx' &&
        /What should happen to (its contents|what’s inside)/.test(read(f))
    );
    expect(
      ownDeleteDialogs,
      'Delete a folder or collection through DeleteFolderDialog.'
    ).toEqual([]);
  });
});
