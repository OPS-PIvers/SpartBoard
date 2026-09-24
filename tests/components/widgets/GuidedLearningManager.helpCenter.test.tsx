// Help Center activities stay out of the Guided Learning library; admins reach them through the Source filter.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import type { GuidedLearningSet, GuidedLearningSetMetadata } from '@/types';
import { toBuildingIndexEntry } from '@/tests/helpers/glBuildingIndexEntry';

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

const building = (
  id: string,
  title: string,
  extra: Partial<GuidedLearningSet> = {}
): GuidedLearningSet => ({
  id,
  title,
  imageUrls: [],
  steps: [],
  mode: 'guided',
  createdAt: 1000,
  updatedAt: 2000,
  isBuilding: true,
  ...extra,
});

const buildingSets = [
  building('b-1', 'Building Lesson'),
  building('h-1', 'Flagged Help Guide', { helpCenter: true }),
  building('h-2', 'Second Help Guide', { helpCenter: true }),
];

const renderManager = (isAdmin: boolean) =>
  render(
    <GuidedLearningManager
      userId="teacher-1"
      sets={[personalSet]}
      buildingSets={buildingSets.map(toBuildingIndexEntry)}
      assignments={[]}
      loading={false}
      buildingLoading={false}
      assignmentsLoading={false}
      isDriveConnected={true}
      isAdmin={isAdmin}
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

describe('GuidedLearningManager — Help Center activities', () => {
  it('hides Help Center sets from the library and its counts', async () => {
    renderManager(false);

    await screen.findByText('Personal Set');
    expect(screen.getByText('Building Lesson')).toBeInTheDocument();
    expect(screen.queryByText('Flagged Help Guide')).not.toBeInTheDocument();
    expect(screen.queryByText('Second Help Guide')).not.toBeInTheDocument();

    const allItemsRow = screen.getByText('All items').closest('button');
    expect(
      within(allItemsRow as HTMLElement).getByText('2')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();
  });

  it('lists only Help Center sets under the admin Help Center filter', async () => {
    renderManager(true);
    await screen.findByText('Personal Set');

    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'help' },
    });

    expect(await screen.findByText('Flagged Help Guide')).toBeInTheDocument();
    expect(screen.getByText('Second Help Guide')).toBeInTheDocument();
    expect(screen.queryByText('Building Lesson')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal Set')).not.toBeInTheDocument();
    expect(screen.getAllByText('Help Center').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'building' },
    });
    expect(await screen.findByText('Building Lesson')).toBeInTheDocument();
    expect(screen.queryByText('Flagged Help Guide')).not.toBeInTheDocument();
  });
});
