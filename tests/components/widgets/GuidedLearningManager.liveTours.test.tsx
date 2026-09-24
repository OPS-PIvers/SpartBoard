import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { GuidedLearningManager } from '@/components/widgets/GuidedLearning/components/GuidedLearningManager';
import { AuthContext } from '@/context/AuthContextValue';
import {
  TOUR_RECORD_EVENT,
  TOUR_START_EVENT,
} from '@/components/tours/tourState';
import type { GuidedLearningSet } from '@/types';
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
    mode: 'guided',
    isBuilding: true,
    createdAt: 1,
    updatedAt: 2,
  }) as GuidedLearningSet;

const renderManager = (liveTours: boolean, isAdmin = true) =>
  render(
    <AuthContext.Provider
      value={
        {
          canAccessFeature: (id: string) => liveTours && id === 'gl-live-tours',
          canSeeShareTracking: () => false,
        } as unknown as React.ContextType<typeof AuthContext>
      }
    >
      <GuidedLearningManager
        userId="teacher-1"
        sets={[]}
        buildingSets={[
          buildingSet('live-1', 'Live tour', true),
          buildingSet('plain-1', 'Plain set', false),
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

const cardMenu = async (title: string) => {
  let card: HTMLElement | null = await screen.findByText(title);
  while (card && !within(card).queryByRole('button', { name: 'More actions' }))
    card = card.parentElement;
  if (!card) throw new Error(`No menu for ${title}`);
  fireEvent.click(within(card).getByRole('button', { name: 'More actions' }));
};

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
});

describe('GuidedLearningManager live tours', () => {
  it('offers Record a tour to admins with live tours', async () => {
    const record = listen(TOUR_RECORD_EVENT);
    renderManager(true);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record a tour' })
    );
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('hides Record a tour without the flag or for non-admins', async () => {
    renderManager(false);
    await screen.findByText('Live tour');
    expect(screen.queryByRole('button', { name: 'Record a tour' })).toBeNull();
    cleanup();
    renderManager(true, false);
    await screen.findByText('Live tour');
    expect(screen.queryByRole('button', { name: 'Record a tour' })).toBeNull();
  });

  it('runs a set with live steps on the board from its menu', async () => {
    const start = listen(TOUR_START_EVENT);
    renderManager(true);
    await cardMenu('Live tour');
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Run live on my board/ })
    );
    expect((start.mock.calls[0][0] as CustomEvent).detail).toEqual({
      setId: 'live-1',
    });
  });

  it('does not offer Run live for a set without live steps', async () => {
    renderManager(true);
    await cardMenu('Plain set');
    expect(
      screen.queryByRole('menuitem', { name: /Run live on my board/ })
    ).toBeNull();
  });
});
