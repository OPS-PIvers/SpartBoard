import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import { AuthContext } from '@/context/AuthContextValue';
import { TOUR_RECORD_EVENT } from '@/components/tours/tourState';
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

const watchWebTourDrafts = vi.hoisted(() => vi.fn());
vi.mock('@/components/tours/webTours', () => ({ watchWebTourDrafts }));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: () => Promise.resolve(true) }),
}));

vi.mock('@/components/tours/web/WebTourEditor', () => ({
  WebTourEditor: ({ initial }: { initial: { title: string } }) => (
    <div>Editing {initial.title}</div>
  ),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

const buildingSet = (id: string, title: string, live: boolean) =>
  ({
    id,
    title,
    imageUrls: ['https://example.com/a.png'],
    steps: [
      {
        id: `${id}-step`,
        xPct: 10,
        yPct: 10,
        imageIndex: 0,
        interactionType: 'tooltip',
        ...(live
          ? { tour: { anchor: 'sidebar.boards', action: 'click' as const } }
          : {}),
      },
    ],
    mode: live ? 'tour' : 'guided',
    isBuilding: true,
    createdAt: 1,
    updatedAt: 2,
  }) as GuidedLearningSet;

interface Extras {
  sets?: GuidedLearningSetMetadata[];
  extraBuilding?: GuidedLearningSet[];
  features?: string[];
}

const personalTour: GuidedLearningSetMetadata = {
  id: 'p-tour',
  title: 'My recorded tour',
  stepCount: 3,
  mode: 'tour',
  imageUrl: '',
  driveFileId: 'drive-1',
  createdAt: 1,
  updatedAt: 2,
};

const personalSet: GuidedLearningSetMetadata = {
  ...personalTour,
  id: 'p-set',
  title: 'Personal lesson',
  mode: 'guided',
  driveFileId: 'drive-2',
};

const renderLibrary = (isAdmin = true, extras: Extras = {}) =>
  render(
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (id: string) =>
            extras.features?.includes(id) ?? false,
          canSeeShareTracking: () => false,
        } as unknown as React.ContextType<typeof AuthContext>
      }
    >
      <GuidedLearningManager
        userId="teacher-1"
        sets={extras.sets ?? []}
        buildingSets={[
          buildingSet('live-1', 'Boards walkthrough', true),
          buildingSet('plain-1', 'Plain set', false),
          ...(extras.extraBuilding ?? []),
        ].map(toBuildingIndexEntry)}
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
    </AuthContext.Provider>
  );

const listeners: [string, EventListener][] = [];
const listen = (type: string) => {
  const fn = vi.fn();
  listeners.push([type, fn]);
  window.addEventListener(type, fn);
  return fn;
};

afterEach(() => {
  listeners.forEach(([type, fn]) => window.removeEventListener(type, fn));
  listeners.length = 0;
  vi.clearAllMocks();
});

// Building sets sit in the pinned building folder, so open it when a test needs them.
const renderManager = (isAdmin = true, extras: Extras = {}) => {
  const result = renderLibrary(isAdmin, extras);
  if (!extras.sets) {
    fireEvent.click(screen.getAllByText('From your building')[0]);
  }
  return result;
};

describe('GuidedLearningManager tours', () => {
  it('offers Record a tour to admins with live tours', async () => {
    const record = listen(TOUR_RECORD_EVENT);
    renderManager();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record a tour' })
    );
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('keeps web tours out of the library, even with the flag on', async () => {
    const record = listen(TOUR_RECORD_EVENT);
    renderManager(true, { features: ['web-tours'] });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record a tour' })
    );
    expect(record).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'Web tour' })).toBeNull();
    expect(watchWebTourDrafts).not.toHaveBeenCalled();
  });

  it('hides Record a tour from non-admins', async () => {
    renderManager(false);
    await screen.findByText('Plain set');
    expect(screen.queryByRole('button', { name: 'Record a tour' })).toBeNull();
  });

  it('never lists a Live tour, for anyone', async () => {
    const helpTour = {
      ...buildingSet('help-1', 'Help Center tour', true),
      helpCenter: true,
    };
    const boundSet = {
      ...buildingSet('bound-1', 'Bound picture guide', false),
      hasLiveTour: true,
    };
    for (const isAdmin of [true, false]) {
      renderManager(isAdmin, { extraBuilding: [helpTour, boundSet] });
      await screen.findByText('Plain set');
      expect(screen.queryByText('Boards walkthrough')).toBeNull();
      expect(screen.queryByText('Help Center tour')).toBeNull();
      expect(screen.queryByText('Bound picture guide')).toBeNull();
      expect(screen.queryByText('Live tour')).toBeNull();
      expect(screen.queryByLabelText('Type')).toBeNull();
      cleanup();
    }
    renderManager(true, { sets: [personalTour, personalSet] });
    await screen.findByText('Personal lesson');
    expect(screen.queryByText('My recorded tour')).toBeNull();
    expect(screen.queryByText("Can't run live")).toBeNull();
  });

  it('keeps a teacher personal tour listed, since only admins can move it', async () => {
    renderManager(false, { sets: [personalTour, personalSet] });
    expect(await screen.findByText('My recorded tour')).toBeTruthy();
  });
});
