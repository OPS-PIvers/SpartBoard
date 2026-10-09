import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { LibraryFolder } from '@/types';
import { FolderViewHeader } from './FolderViewHeader';
import { FolderSidebar } from './FolderSidebar';
import { buildFolderIndex, type LibraryLocation } from './folderView';
import type { LibraryFolderViewModel } from './LibraryFolderViewContext';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

const folder = (id: string, name: string, parentId: string | null) =>
  ({ id, name, parentId, order: 0, createdAt: 0 }) as LibraryFolder;
const FOLDERS = [
  folder('u', 'Unit 2', null),
  folder('w', 'Week 2', 'u'),
  folder('q', 'Quiz prep', 'w'),
  folder('d', 'Day 1', 'q'),
];

const model = (
  location: LibraryLocation,
  overrides: Partial<LibraryFolderViewModel> = {}
): LibraryFolderViewModel => ({
  location,
  navigate: vi.fn(),
  index: buildFolderIndex(FOLDERS),
  totals: new Map([['u', { folders: 3, items: 5 }]]),
  folderRows: [],
  itemNoun: ['set', 'sets'],
  searchActive: false,
  searchScope: 'folder',
  setSearchScope: vi.fn(),
  pathByItemId: new Map(),
  folderIdOf: () => null,
  emptyFolder: false,
  ...overrides,
});

describe('FolderViewHeader', () => {
  it('renders nothing at the top level without folders', () => {
    const { container } = render(
      <FolderViewHeader
        model={model({ kind: 'folder', folderId: null })}
        viewMode="list"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('collapses a deep path and navigates up from a crumb', () => {
    const m = model({ kind: 'folder', folderId: 'd' });
    render(<FolderViewHeader model={m} viewMode="list" />);
    expect(screen.getByText('…')).toHaveAttribute('title', 'Unit 2 › Week 2');
    expect(screen.getByText('Day 1')).toHaveAttribute(
      'aria-current',
      'location'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(m.navigate).toHaveBeenCalledWith({ kind: 'folder', folderId: null });
  });

  it('opens a folder row and widens search', () => {
    const m = model(
      { kind: 'folder', folderId: 'u' },
      {
        searchActive: true,
        folderRows: [{ folder: FOLDERS[1], label: '2 sets' }],
      }
    );
    render(<FolderViewHeader model={m} viewMode="list" />);
    fireEvent.click(screen.getByRole('button', { name: /Week 2/ }));
    expect(m.navigate).toHaveBeenCalledWith({ kind: 'folder', folderId: 'w' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Search all of Library' })
    );
    expect(m.setSearchScope).toHaveBeenCalledWith('all');
  });
});

describe('FolderSidebar in the folder view', () => {
  it('shows Library, All items and Recent and navigates places', () => {
    const m = model({ kind: 'all' });
    render(
      <FolderSidebar
        widget="flashcards"
        folders={FOLDERS}
        selectedFolderId={null}
        onSelectFolder={vi.fn()}
        itemCounts={{ root: 2, u: 3 }}
        folderView={m}
      />
    );
    expect(screen.getByRole('button', { name: /All items/ })).toHaveAttribute(
      'aria-current',
      'location'
    );
    fireEvent.click(screen.getByRole('button', { name: /Recent/ }));
    expect(m.navigate).toHaveBeenCalledWith({ kind: 'recent' });
    fireEvent.click(screen.getByRole('button', { name: /^Library/ }));
    expect(m.navigate).toHaveBeenCalledWith({ kind: 'folder', folderId: null });
  });
});
