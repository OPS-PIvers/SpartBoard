import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

// Fails when a folder browser lists every item at its top level instead of its folders plus unfiled items.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FIX = [
  'A folder browser shows one level at a time: the folders at that level, then only the items filed directly there. Its top level ("All items", "All boards", "Library") never lists items that sit in a folder. A flat list is right only when there are no folders, during a search, or in a named smart view (Recent, Drafts).',
  'Fix: filter the list with itemsAtFolderLevel (and liveFolderOf for orphaned ids) from utils/folderLevel.ts, or use useFolderLibraryView from components/common/library for a widget library. See boardsInView in components/boardsModal/dropIndicator.ts and the root branch of components/admin/DistrictLibrary/DistrictLibraryFolderView.tsx.',
].join('\n');

// Files that show a folder tree or move things between folders but never list a level's items.
const NOT_A_BROWSER: Record<string, string> = {
  'components/common/library/FolderSidebar.tsx': 'side panel tree only',
  'components/common/library/FolderTree.tsx': 'side panel tree only',
};

const SCANNED = ['components'];
const FOLDER_TREE =
  /childFolders\(|siblingCollections\(|childrenOf\.get\(|parentCollectionId|\.parentId\b/;
const ITEM_MEMBERSHIP = /\.(folderId|collectionId)\b/;
const SHARED = /\b(itemsAtFolderLevel|useFolderLibraryView|boardsInView)\b/;
// `selectedFolderId === null ? items : items.filter(...)`: the top level shows everything.
const FLATTEN_IDIOM =
  /(folder|collection|Folder|Collection)\w*Id\s*===\s*null\s*\?\s*[\w.]+\s*:\s*[\w.]+\s*\.filter\(/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });

const files = SCANNED.flatMap((d) => walk(resolve(repoRoot, d)))
  .map((f) => relative(repoRoot, f).replace(/\\/g, '/'))
  .filter((f) => !f.startsWith('components/dev/'));
const read = (f: string) => readFileSync(resolve(repoRoot, f), 'utf8');

describe('folder browsers show folders, then unfiled items, at the top level', () => {
  it('every folder browser filters its list through the shared helper', () => {
    const missing = files.filter((f) => {
      if (f.endsWith('.ts') || NOT_A_BROWSER[f]) return false;
      const src = read(f);
      return (
        FOLDER_TREE.test(src) && ITEM_MEMBERSHIP.test(src) && !SHARED.test(src)
      );
    });
    expect(missing, `${missing.join('\n')}\n\n${FIX}`).toEqual([]);
  });

  it('nothing returns every item when no folder is selected', () => {
    const offenders = files.filter((f) => FLATTEN_IDIOM.test(read(f)));
    expect(offenders, `${offenders.join('\n')}\n\n${FIX}`).toEqual([]);
  });

  it('the not-a-browser list names files that still exist', () => {
    for (const f of Object.keys(NOT_A_BROWSER)) expect(files).toContain(f);
  });
});
