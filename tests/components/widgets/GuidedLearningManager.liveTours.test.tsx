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

const snapshots = vi.hoisted(
  () => new Map<string, { publishedAt: number; set: { surface: 'web' } }>()
);
vi.mock('@/components/tours/publishedTours', () => ({
  watchTours: () => () => undefined,
  getToursVersion: () => 0,
  readPublishedTour: (id: string) => ({
    loaded: true,
    tour: snapshots.get(id) ?? null,
  }),
}));

const createWebTourDraft = vi.fn(() =>
  Promise.resolve({ id: 'web-1', title: 'Untitled web tour' })
);
const webDrafts = vi.hoisted(() => ({ list: [] as GuidedLearningSet[] }));
const webTourStore = vi.hoisted(() => ({
  deleteWebTourDraft: vi.fn(() => Promise.resolve()),
  setWebTourHelpCenter: vi.fn(() => Promise.resolve()),
  duplicateWebTourDraft: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/components/tours/webTours', () => ({
  createWebTourDraft: () => createWebTourDraft(),
  watchWebTourDrafts: (onChange: (sets: GuidedLearningSet[]) => void) => {
    onChange(webDrafts.list);
    return () => undefined;
  },
  ...webTourStore,
}));

const copyLink = vi.hoisted(() =>
  vi.fn((_setId: string, _title: string) => Promise.resolve(true))
);
vi.mock('@/components/tours/web/useCopyWebTourLink', async () => {
  const { useEffect } = await import('react');
  return {
    CopyWebTourLinkTask: (p: {
      setId: string;
      title: string;
      onDone: (ok: boolean) => void;
    }) => {
      useEffect(() => {
        void copyLink(p.setId, p.title).then(p.onDone);
      }, [p]);
      return null;
    },
  };
});

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
  snapshots.clear();
  webDrafts.list = [];
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

  it('asks which kind of tour to record when web tours are on', async () => {
    const record = listen(TOUR_RECORD_EVENT);
    renderManager(true, { features: ['web-tours'] });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record a tour' })
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'SpartBoard tour' }));
    expect(record).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Record a tour' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Web tour' }));
    expect(
      await screen.findByText('Editing Untitled web tour')
    ).toBeInTheDocument();
    expect(createWebTourDraft).toHaveBeenCalledTimes(1);
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

  describe('web tours', () => {
    const webTour = (id: string, title: string, extra = {}) =>
      ({
        id,
        title,
        imageUrls: [],
        steps: [
          {
            id: `${id}-1`,
            xPct: 0,
            yPct: 0,
            imageIndex: 0,
            interactionType: 'tooltip',
            web: {
              urlPattern: 'https://docs.google.com/document/d/*/edit',
              locator: { text: 'Extensions' },
              action: 'click',
            },
          },
        ],
        mode: 'tour',
        surface: 'web',
        createdAt: 1,
        updatedAt: 5,
        ...extra,
      }) as GuidedLearningSet;

    const showTours = () =>
      fireEvent.change(screen.getByLabelText('Type'), {
        target: { value: 'tour' },
      });

    it('lists web tours as cards with their site and publish state', async () => {
      webDrafts.list = [
        webTour('w-draft', 'Docs draft'),
        webTour('w-live', 'Docs published'),
        webTour('w-changed', 'Docs changed', { updatedAt: 50 }),
      ];
      snapshots.set('w-live', { publishedAt: 10, set: { surface: 'web' } });
      snapshots.set('w-changed', { publishedAt: 10, set: { surface: 'web' } });
      renderManager(true, { features: ['web-tours'] });
      showTours();
      const card = async (title: string) => {
        let el: HTMLElement | null = await screen.findByText(title);
        while (el && !within(el).queryByText('docs.google.com'))
          el = el.parentElement;
        if (!el) throw new Error(`No card for ${title}`);
        return el;
      };
      expect(within(await card('Docs draft')).getByText('Draft')).toBeTruthy();
      expect(
        within(await card('Docs published')).getByText('Published')
      ).toBeTruthy();
      expect(
        within(await card('Docs changed')).getByText('Changed since publish')
      ).toBeTruthy();
      expect(screen.queryByText('New web tour')).toBeNull();
    });

    it('hides web tours without the flag', async () => {
      webDrafts.list = [webTour('w-1', 'Docs tour')];
      renderManager(true);
      await screen.findByText('Plain set');
      expect(screen.queryByText('Docs tour')).toBeNull();
    });

    it('copies the link and deletes from the card, with no way to move it into the Help Center', async () => {
      webDrafts.list = [webTour('w-1', 'Docs tour')];
      renderManager(true, { features: ['web-tours'] });
      showTours();
      await screen.findByText('Docs tour');
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      expect(copyLink).toHaveBeenCalledWith('w-1', 'Docs tour');
      expect(await screen.findByText('Link copied')).toBeTruthy();

      await cardMenu('Docs tour');
      expect(
        screen.queryByRole('menuitem', { name: 'Move to Help Center' })
      ).toBeNull();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
      await vi.waitFor(() =>
        expect(webTourStore.deleteWebTourDraft).toHaveBeenCalledWith('w-1')
      );
      expect(webTourStore.setWebTourHelpCenter).not.toHaveBeenCalled();
    });

    it('keeps a web tour already in the Help Center out of the library', async () => {
      webDrafts.list = [webTour('w-1', 'Docs tour', { helpCenter: true })];
      renderManager(true, { features: ['web-tours'] });
      showTours();
      await screen.findByLabelText('Type');
      expect(screen.queryByText('Docs tour')).toBeNull();
      expect(screen.queryByRole('option', { name: 'Help Center' })).toBeNull();
    });

    it('opens the editor from Edit and keeps Play off until published', async () => {
      webDrafts.list = [webTour('w-1', 'Docs tour')];
      renderManager(true, { features: ['web-tours'] });
      showTours();
      let card: HTMLElement | null = await screen.findByText('Docs tour');
      while (card && !within(card).queryByRole('button', { name: 'Play' }))
        card = card.parentElement;
      if (!card) throw new Error('No Docs tour card');
      expect(within(card).getByRole('button', { name: 'Play' })).toBeDisabled();
      await cardMenu('Docs tour');
      fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
      expect(await screen.findByText('Editing Docs tour')).toBeTruthy();
    });
  });
});
