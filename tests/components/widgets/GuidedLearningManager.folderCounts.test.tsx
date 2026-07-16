// Regression test: "All items" badge must count building sets, not just personal sets.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import type { GuidedLearningSet, GuidedLearningSetMetadata } from '@/types';

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

const personalSet: GuidedLearningSetMetadata = {
  id: 'set-1',
  title: 'Personal Set',
  stepCount: 3,
  mode: 'guided',
  imageUrl: '',
  driveFileId: 'drive-1',
  createdAt: 1000,
  updatedAt: 2000,
};

const buildingSet: GuidedLearningSet = {
  id: 'building-1',
  title: 'Building Set',
  imageUrls: [],
  steps: [],
  mode: 'guided',
  createdAt: 1000,
  updatedAt: 2000,
};

describe('GuidedLearningManager — folder sidebar item counts', () => {
  it('includes building sets in the "All items" badge total', async () => {
    render(
      <GuidedLearningManager
        userId="teacher-1"
        sets={[personalSet]}
        buildingSets={[buildingSet]}
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

    // Both cards are visible — the "All items" view shows personal + building.
    await screen.findByText('Personal Set');
    await screen.findByText('Building Set');

    const allItemsRow = screen.getByText('All items').closest('button');
    expect(allItemsRow).not.toBeNull();

    // Badge must equal all visible entries (1 personal + 1 building), not just personal.
    expect(
      within(allItemsRow as HTMLElement).getByText('2')
    ).toBeInTheDocument();
  });
});
