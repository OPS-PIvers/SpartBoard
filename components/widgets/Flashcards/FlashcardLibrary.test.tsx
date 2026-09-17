import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FlashcardAssignment } from '@/types';
import type { UseFoldersResult } from '@/hooks/useFolders';
import { FlashcardLibrary } from './FlashcardLibrary';

const folders: UseFoldersResult = {
  folders: [],
  loading: false,
  error: null,
  createFolder: vi.fn().mockResolvedValue('folder-1'),
  renameFolder: vi.fn().mockResolvedValue(undefined),
  moveFolder: vi.fn().mockResolvedValue(undefined),
  deleteFolder: vi.fn().mockResolvedValue(undefined),
  reorderSiblings: vi.fn().mockResolvedValue(undefined),
  moveItem: vi.fn().mockResolvedValue(undefined),
};

const assignment = (
  overrides: Partial<FlashcardAssignment> = {}
): FlashcardAssignment => ({
  id: 'a-1',
  sessionId: 'a-1',
  setId: 'set-1',
  setTitle: 'Spanish verbs',
  teacherUid: 'teacher-1',
  kind: 'study',
  status: 'active',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const renderLibrary = (
  props: Partial<React.ComponentProps<typeof FlashcardLibrary>> = {}
) => {
  const handlers = {
    onAssignmentResults: vi.fn(),
    onAssignmentPublishScores: vi.fn(),
    onAssignmentUnpublishScores: vi.fn(),
    onAssignmentCopyLink: vi.fn(),
    onAssignmentEnd: vi.fn(),
    onAssignmentReopen: vi.fn(),
    onAssignmentDelete: vi.fn(),
    onTabChange: vi.fn(),
  };
  render(
    <FlashcardLibrary
      sets={[]}
      loading={false}
      error={null}
      folders={folders}
      assignments={[assignment()]}
      assignmentsLoading={false}
      tab="active"
      onNew={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onPresent={vi.fn()}
      onShare={vi.fn()}
      onAssign={vi.fn()}
      onDelete={vi.fn()}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('FlashcardLibrary assignment tabs', () => {
  it('offers Publish scores on a Check and never on a Study', () => {
    const check = assignment({ kind: 'check', checkMode: 'write' });
    const handlers = renderLibrary({ assignments: [check] });
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Publish scores' }));
    expect(handlers.onAssignmentPublishScores).toHaveBeenCalledWith(check);
  });

  it('switches a published Check to Hide scores', () => {
    const published = assignment({
      kind: 'check',
      scoreVisibility: 'score',
    });
    const handlers = renderLibrary({ assignments: [published] });
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide scores' }));
    expect(handlers.onAssignmentUnpublishScores).toHaveBeenCalledWith(
      published
    );
  });

  it('lists active assignments and ends one from the menu', () => {
    const handlers = renderLibrary();
    expect(screen.getByText('Spanish verbs')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Results' }));
    expect(handlers.onAssignmentResults).toHaveBeenCalledWith(assignment());

    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(handlers.onAssignmentCopyLink).toHaveBeenCalledWith(assignment());

    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'End assignment' }));
    expect(handlers.onAssignmentEnd).toHaveBeenCalledWith(assignment());
  });

  it('keeps ended assignments in the archive tab with a reopen action', () => {
    const ended = assignment({ status: 'ended', endedAt: 5 });
    const handlers = renderLibrary({ tab: 'archive', assignments: [ended] });
    expect(screen.getByText('Ended')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    expect(screen.queryByRole('menuitem', { name: 'Copy link' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reopen' }));
    expect(handlers.onAssignmentReopen).toHaveBeenCalledWith(ended);
  });

  it('shows an empty state and switches tabs', () => {
    const handlers = renderLibrary({ assignments: [] });
    expect(screen.getByText('Nothing assigned yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Library/ }));
    expect(handlers.onTabChange).toHaveBeenCalledWith('library');
  });
});
