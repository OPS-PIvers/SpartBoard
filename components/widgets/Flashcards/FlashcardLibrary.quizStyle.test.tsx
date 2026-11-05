import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FlashcardAssignment, FlashcardSet, PeriodAccess } from '@/types';
import type { UseFoldersResult } from '@/hooks/useFolders';
import { FlashcardLibrary } from './FlashcardLibrary';

const startAll = vi.fn().mockResolvedValue([]);
const pauseAll = vi.fn().mockResolvedValue(undefined);
const addToast = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ rosters: [], addToast }),
}));
vi.mock('@/hooks/usePeriodAccess', () => ({
  usePeriodAccess: () => ({ startAll, pauseAll }),
}));

const folders: UseFoldersResult = {
  folders: [],
  loading: false,
  error: null,
  createFolder: vi.fn().mockResolvedValue('folder-1'),
  renameFolder: vi.fn().mockResolvedValue(undefined),
  setFolderColor: vi.fn().mockResolvedValue(undefined),
  moveFolder: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  reorderSiblings: vi.fn().mockResolvedValue(undefined),
  moveItem: vi.fn().mockResolvedValue(undefined),
};

const set: FlashcardSet = {
  id: 'set-1',
  title: 'Spanish verbs',
  termLanguage: 'es',
  definitionLanguage: 'en',
  cards: [
    { id: 'c1', term: 'hablar', definition: 'to speak' },
    { id: 'c2', term: 'comer', definition: 'to eat' },
  ],
  createdAt: 1,
  updatedAt: Date.UTC(2026, 8, 1),
};

const assignment = (
  overrides: Partial<FlashcardAssignment> = {}
): FlashcardAssignment => ({
  id: 'a-1',
  sessionId: 'a-1',
  setId: 'set-1',
  setTitle: 'Spanish verbs',
  teacherUid: 'teacher-1',
  kind: 'check',
  checkMode: 'write',
  status: 'active',
  createdAt: Date.UTC(2026, 8, 2),
  updatedAt: 1,
  periodNames: ['Period 3'],
  ...overrides,
});

const period = (state: PeriodAccess['state']): PeriodAccess => ({
  state,
  openAt: null,
  closeAt: null,
  bellPeriodId: null,
  verified: true,
  label: 'Period 3',
});

const renderLibrary = (
  props: Partial<React.ComponentProps<typeof FlashcardLibrary>> = {}
) => {
  const handlers = {
    onNew: vi.fn(),
    onImport: vi.fn(),
    onShare: vi.fn(),
    onAssignmentResults: vi.fn(),
    onAssignmentMonitor: vi.fn(),
    onAssignmentPublishScores: vi.fn(),
    onAssignmentUnpublishScores: vi.fn(),
    onAssignmentCopyLink: vi.fn(),
    onAssignmentEnd: vi.fn(),
    onAssignmentReopen: vi.fn(),
    onAssignmentDelete: vi.fn(),
    onAssignmentShareWithPlc: vi.fn(),
    onAssignmentStopSharingWithPlc: vi.fn(),
    onBulkDelete: vi.fn().mockResolvedValue(true),
    onTabChange: vi.fn(),
  };
  render(
    <FlashcardLibrary
      sets={[set]}
      loading={false}
      error={null}
      folders={folders}
      assignments={[assignment()]}
      assignmentsLoading={false}
      tab="active"
      onEdit={vi.fn()}
      onPresent={vi.fn()}
      onAssign={vi.fn()}
      onDelete={vi.fn()}
      quizStyle
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

const menuItems = (): string[] => {
  fireEvent.click(screen.getByRole('button', { name: /more/i }));
  return screen.getAllByRole('menuitem').map((item) => item.textContent ?? '');
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FlashcardLibrary with Quiz-style tabs', () => {
  it('shows New set (Create, Import) only on the Library tab', () => {
    renderLibrary();
    expect(screen.queryByRole('button', { name: /New set/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Import$/ })).toBeNull();
  });

  it('orders the In Progress menu like Quiz, without a PLC share', () => {
    renderLibrary();
    expect(screen.getByText('Live')).toBeTruthy();
    expect(menuItems()).toEqual(['Results', 'Share', 'End', 'Delete']);
  });

  it('pauses a live per-period assignment from the menu', async () => {
    renderLibrary({
      assignments: [assignment({ periodAccess: { p3: period('open') } })],
    });
    expect(menuItems()).toEqual(['Results', 'Share', 'Pause', 'End', 'Delete']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pause' }));
    await waitFor(() => expect(pauseAll).toHaveBeenCalled());
    expect(addToast).toHaveBeenCalledWith('Assignment paused.', 'success');
  });

  it('starts a paused assignment and opens the monitor', async () => {
    const paused = assignment({ periodAccess: { p3: period('closed') } });
    const handlers = renderLibrary({ assignments: [paused] });
    expect(screen.getByText('Paused')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() =>
      expect(handlers.onAssignmentMonitor).toHaveBeenCalledWith(paused)
    );
    expect(startAll).toHaveBeenCalled();
  });

  it('keeps Stop sharing with PLC for an assignment already shared', () => {
    renderLibrary({
      assignments: [assignment({ plcShare: { plcId: 'p', sharedAt: 1 } })],
    });
    expect(menuItems()).toContain('Stop sharing with PLC');
  });

  it('shares the set behind an assignment, and hides Share once the set is gone', () => {
    const handlers = renderLibrary();
    menuItems();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share' }));
    expect(handlers.onShare).toHaveBeenCalledWith(set);
  });

  it('hides Share when the set is no longer in the library', () => {
    renderLibrary({ sets: [] });
    expect(menuItems()).not.toContain('Share');
  });

  it('flags a live assignment with no classes', () => {
    renderLibrary({ assignments: [assignment({ periodNames: [] })] });
    expect(screen.getByText('No classes')).toBeTruthy();
  });

  it('orders the Completed menu like Quiz', () => {
    const handlers = renderLibrary({
      tab: 'archive',
      assignments: [assignment({ status: 'ended', scoreVisibility: 'score' })],
    });
    expect(menuItems()).toEqual([
      'Monitor',
      'Share',
      'Update published scores',
      'Unpublish scores',
      'Reopen',
      'Delete',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Monitor' }));
    expect(handlers.onAssignmentMonitor).toHaveBeenCalled();
  });

  it('gives a study resource no score actions', () => {
    renderLibrary({
      tab: 'archive',
      assignments: [assignment({ status: 'ended', kind: 'study' })],
    });
    expect(screen.getByText('Study resource')).toBeTruthy();
    expect(menuItems()).toEqual(['Monitor', 'Share', 'Reopen', 'Delete']);
  });
});

describe('FlashcardLibrary library tab with Quiz-style rows', () => {
  it('shows the card count chip, Live now chip and a Play Assign button', () => {
    const handlers = renderLibrary({ tab: 'library' });
    expect(screen.getByText('2 cards')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open live monitor' }));
    expect(handlers.onAssignmentMonitor).toHaveBeenCalledWith(assignment());
    expect(screen.getByRole('button', { name: /New set/ })).toBeTruthy();
  });

  it('shows a Results chip for an ended assignment', () => {
    const ended = assignment({ status: 'ended', endedAt: 9 });
    const handlers = renderLibrary({ tab: 'library', assignments: [ended] });
    fireEvent.click(screen.getByRole('button', { name: 'View results' }));
    expect(handlers.onAssignmentResults).toHaveBeenCalledWith(ended);
  });

  it('orders the set menu like Quiz', () => {
    renderLibrary({ tab: 'library', assignments: [] });
    expect(menuItems()).toEqual([
      'Edit',
      'Present',
      'Share',
      'Move to folder…',
      'Delete',
    ]);
  });

  it('bulk deletes selected sets', async () => {
    const handlers = renderLibrary({ tab: 'library', assignments: [] });
    fireEvent.click(screen.getByRole('button', { name: /Select/ }));
    fireEvent.click(screen.getByText('Spanish verbs'));
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    await waitFor(() =>
      expect(handlers.onBulkDelete).toHaveBeenCalledWith([set])
    );
  });
});
