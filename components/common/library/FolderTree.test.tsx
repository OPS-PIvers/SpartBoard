import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findTourAnchors } from '@/components/tours/resolveTourAnchor';
import type { LibraryFolder } from '@/types';
import { FolderTree } from './FolderTree';

const folder = (id: string, name: string, order: number): LibraryFolder => ({
  id,
  name,
  parentId: null,
  order,
  createdAt: 0,
});

const renderTree = (selectedFolderId: string | null) =>
  render(
    <FolderTree
      folders={[folder('a', 'Samples', 0), folder('b', 'Unit 1', 1)]}
      selectedFolderId={selectedFolderId}
      onSelectFolder={vi.fn()}
      expanded={{}}
      onToggleExpanded={vi.fn()}
      itemCounts={{ a: 3, b: 2 }}
      openMenuId={null}
      onOpenMenu={vi.fn()}
      renamingId={null}
      onStartRename={vi.fn()}
      onCommitRename={vi.fn()}
      onCancelRename={vi.fn()}
      onRequestDelete={vi.fn()}
      onCreateChild={vi.fn()}
      onMoveToRoot={vi.fn()}
    />
  );

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 20, 20)
  );
});
afterEach(() => vi.restoreAllMocks());

describe('FolderTree actions button', () => {
  it('shows on the selected folder without hover', () => {
    const { getByLabelText } = renderTree('b');
    expect(getByLabelText('Actions for Unit 1').className).toContain(
      'opacity-100'
    );
    expect(getByLabelText('Actions for Samples').className).toMatch(
      /(^|\s)opacity-0(\s|$)/
    );
  });

  it('gives each folder row its own tour key', () => {
    const { getByLabelText } = renderTree(null);
    const menu = getByLabelText('Actions for Unit 1');
    expect(menu.getAttribute('data-tour-field')).toBe('b');
    expect(
      findTourAnchors({
        anchor: 'library-shell.folder-tree-item:folders#row-2',
      }).map((el) => el.textContent)
    ).toEqual(['Unit 1']);
  });
});
