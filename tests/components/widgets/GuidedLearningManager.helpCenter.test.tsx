// Help Center sets never show in the Guided Learning library; admins move sets there from the kebab.

import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import { AuthContext } from '@/context/AuthContextValue';
import type { GuidedLearningSet, GuidedLearningSetMetadata } from '@/types';
import { toBuildingIndexEntry } from '@/tests/helpers/glBuildingIndexEntry';

vi.mock('@/components/common/library/lastLibraryLocation', () => ({
  readLastLibraryLocation: () => Promise.resolve(null),
  saveLastLibraryLocation: vi.fn(),
  resetLastLibraryLocationCache: vi.fn(),
}));

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

const confirm = vi.hoisted(() => ({ result: true, calls: [] as string[] }));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    showConfirm: (message: string) => {
      confirm.calls.push(message);
      return Promise.resolve(confirm.result);
    },
  }),
}));

afterEach(() => {
  confirm.result = true;
  confirm.calls.length = 0;
});

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

const pendingSet: GuidedLearningSetMetadata = {
  ...personalSet,
  id: 'set-2',
  title: 'Moving Set',
  driveFileId: 'drive-2',
  movedToHelpCenterAt: 3000,
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

type MoveHandler = NonNullable<
  React.ComponentProps<typeof GuidedLearningManager>['onMoveToHelpCenter']
>;

const renderManager = (
  isAdmin: boolean,
  onOpenAIAuthoring: (library: 'personal' | 'building') => void = vi.fn(),
  onMoveToHelpCenter: MoveHandler | undefined = vi.fn(),
  sets: GuidedLearningSetMetadata[] = [personalSet]
) =>
  render(
    <AuthContext.Provider
      value={
        {
          // The Guided Learning AI switch defaults to admins only.
          canAccessFeature: (id: string) =>
            id === 'gemini-functions' ||
            (id === 'guided-learning-ai' && isAdmin),
          canSeeShareTracking: () => false,
        } as unknown as React.ContextType<typeof AuthContext>
      }
    >
      <GuidedLearningManager
        userId="teacher-1"
        sets={sets}
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
        onBulkDeletePersonal={vi.fn()}
        onDeleteBuilding={vi.fn()}
        onMoveToHelpCenter={isAdmin ? onMoveToHelpCenter : undefined}
        onCreateNewPersonal={vi.fn()}
        onCreateNewBuilding={vi.fn()}
        onOpenAIAuthoring={onOpenAIAuthoring}
        onReorderPersonal={vi.fn()}
        recentSessionIds={{}}
        onViewResults={vi.fn()}
        onAssignmentCopyLink={vi.fn()}
        onAssignmentOpenResults={vi.fn()}
        onAssignmentArchive={vi.fn()}
        onAssignmentUnarchive={vi.fn()}
        onAssignmentDelete={vi.fn()}
      />
    </AuthContext.Provider>
  );

const openBuildingFolder = async () =>
  fireEvent.click((await screen.findAllByText('From your building'))[0]);

describe('GuidedLearningManager — Help Center activities', () => {
  it('hides Help Center sets from the library and its counts', async () => {
    renderManager(false);

    await screen.findByText('Personal Set');
    expect(screen.queryByText('Flagged Help Guide')).not.toBeInTheDocument();
    expect(screen.queryByText('Second Help Guide')).not.toBeInTheDocument();

    await openBuildingFolder();
    expect(await screen.findByText('Building Lesson')).toBeInTheDocument();
    expect(screen.queryByText('Flagged Help Guide')).not.toBeInTheDocument();
    expect(screen.queryByText('Second Help Guide')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();
  });

  it('gives admins no Help Center source filter', async () => {
    renderManager(true);
    await screen.findByText('Personal Set');
    const source = screen.getByLabelText('Source');
    expect(
      within(source).queryByRole('option', { name: 'Help Center' })
    ).toBeNull();
    fireEvent.change(source, { target: { value: 'building' } });
    await openBuildingFolder();
    expect(await screen.findByText('Building Lesson')).toBeInTheDocument();
    expect(screen.queryByText('Flagged Help Guide')).not.toBeInTheDocument();
  });
});

const cardMenu = async (title: string) => {
  let card: HTMLElement | null = await screen.findByText(title);
  while (card && !within(card).queryByRole('button', { name: 'More actions' }))
    card = card.parentElement;
  if (!card) throw new Error(`No menu for ${title}`);
  fireEvent.click(within(card).getByRole('button', { name: 'More actions' }));
};

const moveItem = () =>
  screen.findByRole('menuitem', { name: /Move to Help Center/ });

describe('GuidedLearningManager — Move to Help Center', () => {
  it("moves an admin's own personal set without asking", async () => {
    const onMove = vi.fn();
    renderManager(true, vi.fn(), onMove);
    await cardMenu('Personal Set');
    fireEvent.click(await moveItem());
    await vi.waitFor(() =>
      expect(onMove).toHaveBeenCalledWith('set-1', 'drive-1', undefined)
    );
    expect(confirm.calls).toHaveLength(0);
  });

  it('confirms that a building set leaves every library before moving it', async () => {
    const onMove = vi.fn();
    renderManager(true, vi.fn(), onMove);
    await openBuildingFolder();
    await cardMenu('Building Lesson');
    fireEvent.click(await moveItem());
    await vi.waitFor(() =>
      expect(onMove).toHaveBeenCalledWith(
        'b-1',
        undefined,
        expect.objectContaining({ id: 'b-1' })
      )
    );
    expect(confirm.calls[0]).toMatch(/every teacher's building library/);
  });

  it('keeps a building set when the admin cancels the confirm', async () => {
    confirm.result = false;
    const onMove = vi.fn();
    renderManager(true, vi.fn(), onMove);
    await openBuildingFolder();
    await cardMenu('Building Lesson');
    fireEvent.click(await moveItem());
    await vi.waitFor(() => expect(confirm.calls).toHaveLength(1));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('offers no way back to the library', async () => {
    renderManager(true);
    await cardMenu('Personal Set');
    await moveItem();
    expect(
      screen.queryByRole('menuitem', { name: /Move to library/ })
    ).toBeNull();
  });

  it('offers the move only to admins', async () => {
    renderManager(false);
    await screen.findByText('Personal Set');
    await openBuildingFolder();
    await screen.findByText('Building Lesson');
    for (const more of screen.queryAllByRole('button', {
      name: 'More actions',
    })) {
      fireEvent.click(more);
    }
    expect(
      screen.queryByRole('menuitem', { name: /Move to Help Center/ })
    ).toBeNull();
  });

  it('tags a set moved while students had it open, with no second move', async () => {
    renderManager(true, vi.fn(), vi.fn(), [personalSet, pendingSet]);
    expect(await screen.findByText('Moved to Help Center')).toBeInTheDocument();
    await cardMenu('Moving Set');
    expect(
      screen.queryByRole('menuitem', { name: /Move to Help Center/ })
    ).toBeNull();
  });

  it('drops the tag once the set is edited after the move', async () => {
    renderManager(true, vi.fn(), vi.fn(), [{ ...pendingSet, updatedAt: 4000 }]);
    await screen.findByText('Moving Set');
    expect(screen.queryByText('Moved to Help Center')).toBeNull();
  });
});

describe('GuidedLearningManager — AI drafts land in the library being viewed', () => {
  it('opens AI for the personal library, then for the building library', async () => {
    const onOpenAIAuthoring = vi.fn();
    renderManager(true, onOpenAIAuthoring);
    await screen.findByText('Personal Set');

    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    expect(onOpenAIAuthoring).toHaveBeenLastCalledWith('personal');

    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: 'building' },
    });
    await openBuildingFolder();
    await screen.findByText('Building Lesson');
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    expect(onOpenAIAuthoring).toHaveBeenLastCalledWith('building');
  });

  it('offers AI only to admins while the switch is at its default', async () => {
    renderManager(false);
    await screen.findByText('Personal Set');
    expect(screen.queryByRole('button', { name: 'AI' })).toBeNull();
  });
});
