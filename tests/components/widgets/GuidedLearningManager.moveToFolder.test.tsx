// Regression test: the row kebab's "Move to folder…" picker hands the folder
// picker an unprefixed set id, so routing it through the drop handler (which
// requires a "personal:" prefix) silently dropped every move.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import type { GuidedLearningSetMetadata, LibraryFolder } from '@/types';

const moveItem = vi.fn();

const folder: LibraryFolder = {
  id: 'folder-1',
  name: 'Schoology Guides',
  parentId: null,
  order: 0,
  createdAt: 1000,
};

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [folder],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem,
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

const personalSet: GuidedLearningSetMetadata = {
  id: 'set-1',
  title: 'Access Archived Schoology Courses',
  stepCount: 4,
  mode: 'guided',
  imageUrl: '',
  driveFileId: 'drive-1',
  createdAt: 1000,
  updatedAt: 2000,
};

const renderManager = (): void => {
  render(
    <GuidedLearningManager
      userId="teacher-1"
      sets={[personalSet]}
      buildingSets={[]}
      assignments={[]}
      loading={false}
      buildingLoading={false}
      assignmentsLoading={false}
      isDriveConnected={true}
      isAdmin={false}
      onPlay={vi.fn()}
      onEdit={vi.fn()}
      onAssign={vi.fn()}
      onDeletePersonal={vi.fn()}
      onDeleteBuilding={vi.fn()}
      onCreateNewPersonal={vi.fn()}
      onCreateNewBuilding={vi.fn()}
      onOpenAIAuthoring={vi.fn()}
      onReorderPersonal={vi.fn()}
      recentSessionIds={{}}
      onViewResults={vi.fn()}
      onAssignmentCopyLink={vi.fn()}
      onAssignmentOpenResults={vi.fn()}
      onAssignmentArchive={vi.fn()}
      onAssignmentUnarchive={vi.fn()}
      onAssignmentDelete={vi.fn()}
    />
  );
};

describe('GuidedLearningManager — move to folder', () => {
  it('commits the move when a folder is picked from the row kebab', async () => {
    const user = userEvent.setup();
    moveItem.mockClear();
    renderManager();

    await screen.findByText('Access Archived Schoology Courses');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByText('Move to folder…'));

    // Scoped to the picker — the folder sidebar lists the same name.
    const picker = await screen.findByRole('dialog');
    // Unprefixed set id — the picker never sees the "personal:" grid id.
    await user.click(within(picker).getByText('Schoology Guides'));
    expect(moveItem).toHaveBeenCalledWith('set-1', 'folder-1');
  });

  it('moves back to the root when "All items" is picked', async () => {
    const user = userEvent.setup();
    moveItem.mockClear();
    renderManager();

    await screen.findByText('Access Archived Schoology Courses');
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByText('Move to folder…'));
    await user.click(await screen.findByText('All items (no folder)'));

    expect(moveItem).toHaveBeenCalledWith('set-1', null);
  });
});
