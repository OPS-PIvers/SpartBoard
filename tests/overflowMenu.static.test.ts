import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Fails when a file hand-builds its own kebab (⋯) menu instead of using components/common/OverflowMenu.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Kebab menus not yet on the shared menu. This list only shrinks.
const KNOWN_COPIES = [
  // Widget title-bar menu with its own touch and minimize handling.
  'components/common/DraggableWindow.tsx',
  // Folder rows; the folder system is being merged separately.
  'components/common/library/FolderTree.tsx',
  // One menu state shared by several step and action menus in the modal.
  'components/connections/ConnectionEditorModal.tsx',
];

const filesMatching = (pattern: string) =>
  execFileSync(
    'git',
    ['grep', '-lE', pattern, '--', 'components/*.tsx', ':!*.test.*'],
    { cwd: repoRoot, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean);

describe('overflow menu guard', () => {
  it('builds every kebab menu with the shared OverflowMenu', () => {
    const kebabs = new Set(
      filesMatching(String.raw`\b(MoreHorizontal|MoreVertical)\b`)
    );
    const copies = filesMatching('role="menuitem"')
      .filter((f) => kebabs.has(f))
      .filter((f) => f !== 'components/common/OverflowMenu.tsx')
      .sort();
    expect(
      copies,
      'A ⋯ menu with its own menu rows. Use OverflowMenu from components/common/OverflowMenu (side menus, busy rows, confirm rows, check marks and shortcut hints are built in).'
    ).toEqual([...KNOWN_COPIES].sort());
  });

  it('keeps one OverflowMenu component', () => {
    const defs = filesMatching(String.raw`export const OverflowMenu\b`);
    expect(defs).toEqual(['components/common/OverflowMenu.tsx']);
    expect(
      readFileSync(
        resolve(repoRoot, 'components/common/OverflowMenu.tsx'),
        'utf8'
      )
    ).toContain('createPortal');
  });
});
