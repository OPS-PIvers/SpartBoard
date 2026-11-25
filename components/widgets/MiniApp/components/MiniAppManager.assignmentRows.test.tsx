import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MiniAppManager } from './MiniAppManager';
import type { MiniAppAssignment } from '@/types';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: () => true,
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: null }),
}));

vi.mock('@/hooks/useFolders', () => {
  const state = {
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
    setFolderColor: vi.fn(),
    reorderEntries: vi.fn(),
  };
  return { useFolders: () => state };
});

vi.mock('@/hooks/useLibraryPlacements', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useLibraryPlacements')>();
  const placements = {
    byKey: new Map(),
    loading: false,
    place: vi.fn(),
    unplace: vi.fn(),
  };
  return { ...actual, useLibraryPlacements: () => placements };
});

vi.mock('@/components/common/library/lastLibraryLocation', () => ({
  readLastLibraryLocation: () => Promise.resolve(null),
  saveLastLibraryLocation: vi.fn(),
  resetLastLibraryLocationCache: vi.fn(),
}));

const live: MiniAppAssignment = {
  id: 'a1',
  sessionId: 's1',
  appId: 'app1',
  appTitle: 'Brain Explorer',
  assignmentName: 'Brain Explorer',
  teacherUid: 't1',
  status: 'active',
  createdAt: Date.UTC(2026, 10, 16, 15),
  updatedAt: Date.UTC(2026, 10, 16, 15),
  mode: 'submissions',
  rosterIds: ['r1'],
};
const ended: MiniAppAssignment = { ...live, id: 'a2', status: 'inactive' };

const baseProps = {
  personalLibrary: [],
  globalLibrary: [],
  onTabChange: vi.fn(),
  onCreate: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onRun: vi.fn(),
  onAssign: vi.fn(),
  onShowAssignments: vi.fn(),
  onReorder: vi.fn(),
  onSaveGlobalToLibrary: vi.fn(),
  savingGlobalId: null,
  onImport: vi.fn(),
  onExport: vi.fn(),
  onArchiveCopyUrl: vi.fn(),
  onArchiveEnd: vi.fn(),
  onArchiveDelete: vi.fn(),
};

describe('MiniAppManager assignment rows', () => {
  it('opens the monitor from an In Progress row and labels the tab Completed', async () => {
    const onArchiveMonitor = vi.fn();
    render(
      <MiniAppManager
        {...baseProps}
        tab="active"
        assignments={[live, ended]}
        onArchiveMonitor={onArchiveMonitor}
        onArchiveResults={vi.fn()}
        assignmentClassNames={() => ['Period 1']}
      />
    );
    expect(screen.getByRole('tab', { name: /Completed/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Archive/ })).toBeNull();
    // The app title repeats the assignment name, so it isn't shown twice.
    expect(screen.getAllByText('Brain Explorer')).toHaveLength(1);
    expect(screen.getByText('1 class')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Monitor' }));
    expect(onArchiveMonitor).toHaveBeenCalledWith(live);
  });

  it('opens results from a Completed row', async () => {
    const onArchiveResults = vi.fn();
    render(
      <MiniAppManager
        {...baseProps}
        tab="archive"
        assignments={[live, ended]}
        onArchiveMonitor={vi.fn()}
        onArchiveResults={onArchiveResults}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(onArchiveResults).toHaveBeenCalledWith(ended);
  });

  it('keeps Copy link as the row button when the monitor is not wired', async () => {
    const onArchiveCopyUrl = vi.fn();
    render(
      <MiniAppManager
        {...baseProps}
        tab="active"
        assignments={[live]}
        onArchiveCopyUrl={onArchiveCopyUrl}
      />
    );
    expect(screen.queryByRole('button', { name: 'Monitor' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(onArchiveCopyUrl).toHaveBeenCalledWith(live);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      within(screen.getByRole('menu')).getByRole('menuitem', {
        name: 'Copy student link',
      })
    ).toBeInTheDocument();
  });
});
