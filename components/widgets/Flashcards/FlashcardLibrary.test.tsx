import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FlashcardAssignment, FlashcardSet } from '@/types';
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

describe('FlashcardLibrary set-library grid empty states', () => {
  it('shows a build-your-first-set state when there are no sets', () => {
    renderLibrary({ tab: 'library', sets: [] });
    expect(screen.getByText('Build your first set')).toBeTruthy();
  });

  it('shows a no-matching-sets state when a search filters out every set', () => {
    const set: FlashcardSet = {
      id: 'set-1',
      title: 'Spanish verbs',
      termLanguage: 'es',
      definitionLanguage: 'en',
      cards: [],
      createdAt: 1,
      updatedAt: 1,
    };
    renderLibrary({ tab: 'library', sets: [set] });
    fireEvent.change(screen.getByPlaceholderText('Search flashcard sets…'), {
      target: { value: 'no such set' },
    });
    expect(screen.getByText('No matching sets')).toBeTruthy();
    expect(screen.queryByText('Build your first set')).toBeNull();
  });
});

describe('FlashcardLibrary set-library grid card identity', () => {
  const makeSet = (overrides: Partial<FlashcardSet>): FlashcardSet => ({
    id: 'set',
    title: 'Untitled',
    termLanguage: 'es',
    definitionLanguage: 'en',
    cards: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  it("closes a removed card's open menu instead of leaking it onto the card that slides into its old position", () => {
    // Sorted "Last updated" desc (the library's default sort), so render order is A, B, C.
    const setA = makeSet({ id: 'set-a', title: 'Set A', updatedAt: 3 });
    const setB = makeSet({
      id: 'set-b',
      title: 'Set B',
      updatedAt: 2,
      publicShareId: 'share-b',
    });
    const setC = makeSet({ id: 'set-c', title: 'Set C', updatedAt: 1 });

    const { rerender } = render(
      <FlashcardLibrary
        sets={[setA, setB, setC]}
        loading={false}
        error={null}
        folders={folders}
        assignments={[]}
        assignmentsLoading={false}
        tab="library"
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onPresent={vi.fn()}
        onShare={vi.fn()}
        onAssign={vi.fn()}
        onDelete={vi.fn()}
        onAssignmentResults={vi.fn()}
        onAssignmentPublishScores={vi.fn()}
        onAssignmentUnpublishScores={vi.fn()}
        onAssignmentCopyLink={vi.fn()}
        onAssignmentEnd={vi.fn()}
        onAssignmentReopen={vi.fn()}
        onAssignmentDelete={vi.fn()}
        onTabChange={vi.fn()}
      />
    );

    // Open Set B's (the middle card's) overflow menu.
    const moreButtons = screen.getAllByRole('button', {
      name: 'More actions',
    });
    fireEvent.click(moreButtons[1]);
    expect(screen.getByText('Manage public link')).toBeTruthy();

    // Set B is deleted; Set C slides up into the DOM position Set B's open
    // menu occupied. Without a stable `key`, React reuses that card's
    // component instance (and its open-menu state) for Set C instead of
    // unmounting it, so Set C's card would render with a menu the user
    // never opened.
    rerender(
      <FlashcardLibrary
        sets={[setA, setC]}
        loading={false}
        error={null}
        folders={folders}
        assignments={[]}
        assignmentsLoading={false}
        tab="library"
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onPresent={vi.fn()}
        onShare={vi.fn()}
        onAssign={vi.fn()}
        onDelete={vi.fn()}
        onAssignmentResults={vi.fn()}
        onAssignmentPublishScores={vi.fn()}
        onAssignmentUnpublishScores={vi.fn()}
        onAssignmentCopyLink={vi.fn()}
        onAssignmentEnd={vi.fn()}
        onAssignmentReopen={vi.fn()}
        onAssignmentDelete={vi.fn()}
        onTabChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('menu')).toBeNull();
  });
});
