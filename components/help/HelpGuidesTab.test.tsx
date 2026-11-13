import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelpResourceItem } from '@/types/helpCenter';
import { TOUR_START_EVENT } from '@/components/tours/tourState';
import { HelpGuidesTab } from './HelpGuidesTab';

const firestoreMocks = vi.hoisted(() => ({
  updateDoc: vi.fn(() => Promise.resolve(undefined)),
  increment: vi.fn((n: number) => ({ __increment: n })),
}));

const helpState = vi.hoisted(() => ({
  items: [] as HelpResourceItem[],
  categories: [
    { id: 'getting-started', name: 'Getting started', order: 0 },
    { id: 'boards-widgets', name: 'Boards & widgets', order: 1 },
    { id: 'admin', name: 'Admin', order: 2 },
  ],
}));

const glMocks = vi.hoisted(() => ({
  tourSetIds: new Set<string>(),
  published: new Set<string>(),
  canRunLive: true,
  webTours: new Map<string, string>(),
  features: new Set<string>(),
  loadBuildingSet: vi.fn(),
  playerProps: [] as { teacherMode?: boolean; setTitle: string }[],
}));

vi.mock('firebase/firestore', () => ({
  updateDoc: firestoreMocks.updateDoc,
  increment: firestoreMocks.increment,
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  collection: (_db: unknown, name: string) => ({ name }),
  onSnapshot: () => vi.fn(),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('@/components/tours/publishedTours', () => ({
  usePublishedTour: () => ({ loaded: true, tour: null }),
  watchTours: () => () => undefined,
  getToursVersion: () => 0,
  isTourRunnable: (id: string) => glMocks.published.has(id),
  loadRunnableTour: vi.fn(),
  readPublishedTour: (id: string) => {
    const site = glMocks.webTours.get(id);
    return {
      loaded: true,
      tour:
        site === undefined
          ? null
          : {
              publishedAt: 1,
              set: {
                surface: 'web',
                steps: [{ web: { urlPattern: `https://${site}/home` } }],
              },
            },
    };
  },
}));

vi.mock('@/components/tours/useCanRunLiveTour', () => ({
  useCanRunLiveTour: () => glMocks.canRunLive,
}));

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
  isConfigured: true,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    orgId: 'org-1',
    user: { uid: 'u1' },
    canAccessFeature: (id: string) => glMocks.features.has(id),
  }),
}));

vi.mock('@/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { shortName: 'Orono' } }),
}));

vi.mock('@/hooks/useHelpResources', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useHelpResources')>();
  return {
    ...actual,
    useHelpResources: () => ({
      items: helpState.items,
      categories: helpState.categories,
      loading: false,
      error: null,
    }),
  };
});

vi.mock('@/hooks/useGuidedLearning', () => ({
  loadBuildingSet: glMocks.loadBuildingSet,
  useLiveTourSetIds: () => glMocks.tourSetIds,
}));

vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningPlayer',
  () => ({
    GuidedLearningPlayer: (props: {
      teacherMode?: boolean;
      set: { title: string };
    }) => {
      glMocks.playerProps.push({
        teacherMode: props.teacherMode,
        setTitle: props.set.title,
      });
      return <div data-testid="gl-player">{props.set.title}</div>;
    },
  })
);

const makeItem = (
  overrides: Partial<HelpResourceItem> & { id: string }
): HelpResourceItem => ({
  kind: 'guided-learning',
  title: 'Item',
  description: '',
  categoryId: 'getting-started',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: [],
  url: null,
  embedType: null,
  setId: `set-${overrides.id}`,
  openCount: 0,
  createdBy: 'u1',
  createdByEmail: 'a@b.c',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('HelpGuidesTab', () => {
  beforeEach(() => {
    firestoreMocks.updateDoc.mockClear();
    glMocks.loadBuildingSet.mockReset();
    glMocks.loadBuildingSet.mockResolvedValue(null);
    glMocks.playerProps.length = 0;
    glMocks.tourSetIds = new Set();
    glMocks.published = new Set();
    glMocks.canRunLive = true;
    glMocks.webTours = new Map();
    glMocks.features = new Set();
    helpState.items = [
      makeItem({ id: 'v1', title: 'Welcome video' }),
      makeItem({
        id: 'd1',
        title: 'Board basics',
        categoryId: 'boards-widgets',
        widgetTypes: ['clock'],
      }),
    ];
  });

  it('opens the resource named by a shared link', () => {
    render(<HelpGuidesTab query="" itemId="d1" />);
    expect(
      screen.getByRole('heading', { name: 'Board basics' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('falls back to the list when a shared link names an unknown resource', () => {
    render(<HelpGuidesTab query="" itemId="missing" />);
    expect(screen.getByText('Welcome video')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('lists only categories that have visible items, plus All', () => {
    render(<HelpGuidesTab query="" />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Getting started' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Boards & widgets' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
  });

  it('offers no embed kind filters', () => {
    render(<HelpGuidesTab query="" />);
    for (const name of ['Docs', 'Slides', 'Videos', 'Activities', 'Other']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('badges live tours and filters to them with the tours chip', async () => {
    const user = userEvent.setup();
    glMocks.tourSetIds = new Set(['tour-set']);
    glMocks.published = new Set(['tour-set']);
    helpState.items.push(
      makeItem({
        id: 'g1',
        kind: 'guided-learning',
        title: 'Boards walkthrough',
        url: null,
        embedType: null,
        setId: 'tour-set',
      })
    );
    render(<HelpGuidesTab query="" />);
    expect(screen.getAllByText('Live tour')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Live tours' }));
    expect(screen.getByText('Boards walkthrough')).toBeInTheDocument();
    expect(screen.queryByText('Welcome video')).toBeNull();
  });

  it('ignores a guide that still links a web tour, even for staff with web tours', () => {
    glMocks.features = new Set(['web-tours']);
    glMocks.webTours = new Map([['web-set', 'docs.google.com']]);
    helpState.items.push(
      makeItem({
        id: 'w1',
        kind: 'guided-learning',
        title: 'Apps Script in Docs',
        url: null,
        embedType: null,
        setId: 'web-set',
      })
    );
    render(<HelpGuidesTab query="" />);
    expect(screen.queryByText('Apps Script in Docs')).toBeNull();
    expect(screen.queryByText('docs.google.com')).toBeNull();
  });

  it('hides a web tour from staff without web tours', () => {
    glMocks.webTours = new Map([['web-set', 'docs.google.com']]);
    helpState.items.push(
      makeItem({
        id: 'w1',
        kind: 'guided-learning',
        title: 'Apps Script in Docs',
        url: null,
        embedType: null,
        setId: 'web-set',
      })
    );
    render(<HelpGuidesTab query="" />);
    expect(screen.queryByText('Apps Script in Docs')).toBeNull();
  });

  const tourItem = () =>
    makeItem({
      id: 'g1',
      kind: 'guided-learning',
      title: 'Boards walkthrough',
      url: null,
      embedType: null,
      setId: 'tour-set',
    });

  it('opens a live tour as its steps instead of starting it', async () => {
    const user = userEvent.setup();
    glMocks.tourSetIds = new Set(['tour-set']);
    glMocks.published = new Set(['tour-set']);
    glMocks.loadBuildingSet.mockResolvedValue(null);
    helpState.items.push(tourItem());
    const started = vi.fn();
    window.addEventListener(TOUR_START_EVENT, started);
    render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Boards walkthrough'));
    window.removeEventListener(TOUR_START_EVENT, started);
    expect(started).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('opens a shared link to a live tour as its steps', () => {
    glMocks.published = new Set(['tour-set']);
    glMocks.loadBuildingSet.mockResolvedValue(null);
    helpState.items.push(tourItem());
    const started = vi.fn();
    window.addEventListener(TOUR_START_EVENT, started);
    render(<HelpGuidesTab query="" itemId="g1" />);
    window.removeEventListener(TOUR_START_EVENT, started);
    expect(started).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('opens the viewer from a shared link to an unpublished tour', () => {
    glMocks.loadBuildingSet.mockResolvedValue(null);
    helpState.items.push(tourItem());
    const started = vi.fn();
    window.addEventListener(TOUR_START_EVENT, started);
    render(<HelpGuidesTab query="" itemId="g1" />);
    window.removeEventListener(TOUR_START_EVENT, started);
    expect(started).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('does not badge a tour that was never published', () => {
    glMocks.tourSetIds = new Set(['tour-set']);
    helpState.items.push(tourItem());
    render(<HelpGuidesTab query="" />);
    expect(screen.getByText('Boards walkthrough')).toBeInTheDocument();
    expect(screen.queryByText('Live tour')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Live tours' })).toBeNull();
  });

  it('preselects the widget filter and clears it from the chip', async () => {
    const user = userEvent.setup();
    render(<HelpGuidesTab query="" widgetType="clock" />);
    expect(screen.getByText('Board basics')).toBeInTheDocument();
    expect(screen.queryByText('Welcome video')).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Clear widget filter' })
    );
    expect(screen.getByText('Welcome video')).toBeInTheDocument();
  });

  it('counts the open once per id', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Welcome video'));
    await waitFor(() =>
      expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1)
    );

    unmount();
    render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Welcome video'));
    await waitFor(() => expect(screen.getByText('Back')).toBeInTheDocument());
    expect(firestoreMocks.updateDoc).toHaveBeenCalledTimes(1);
  });

  it('renders the Guided Learning player in teacher mode', async () => {
    glMocks.loadBuildingSet.mockResolvedValue({ id: 's1', title: 'Tour set' });
    helpState.items = [
      makeItem({
        id: 'g1',
        title: 'Tour activity',
        kind: 'guided-learning',
        url: null,
        embedType: null,
        setId: 's1',
      }),
    ];
    const user = userEvent.setup();
    render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Tour activity'));

    await waitFor(() =>
      expect(screen.getByTestId('gl-player')).toBeInTheDocument()
    );
    expect(glMocks.playerProps[0]).toEqual({
      teacherMode: true,
      setTitle: 'Tour set',
    });
  });

  it('shows a plain message when the activity set is gone', async () => {
    glMocks.loadBuildingSet.mockResolvedValue(null);
    helpState.items = [
      makeItem({
        id: 'g2',
        title: 'Missing activity',
        kind: 'guided-learning',
        url: null,
        embedType: null,
        setId: 'gone',
      }),
    ];
    const user = userEvent.setup();
    render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Missing activity'));

    await waitFor(() =>
      expect(
        screen.getByText('This activity is no longer available')
      ).toBeInTheDocument()
    );
  });

  it('falls back to All when the selected category loses its items', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<HelpGuidesTab query="" />);
    await user.click(screen.getByRole('button', { name: 'Boards & widgets' }));
    expect(screen.getByText('Board basics')).toBeInTheDocument();

    // The widget deep link scopes items to 'clock'-free content, dropping that category.
    helpState.items = [makeItem({ id: 'v1', title: 'Welcome video' })];
    rerender(<HelpGuidesTab query="" widgetType="clock" />);
    rerender(<HelpGuidesTab query="" />);

    expect(
      screen.queryByRole('button', { name: 'Boards & widgets' })
    ).toBeNull();
    expect(screen.getByText('Welcome video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('moves focus to Back on open and back to the card on return', async () => {
    const user = userEvent.setup();
    render(<HelpGuidesTab query="" />);
    const card = screen.getByText('Welcome video').closest('button');
    await user.click(screen.getByText('Welcome video'));

    const back = screen.getByRole('button', { name: 'Back' });
    await waitFor(() => expect(document.activeElement).toBe(back));

    await user.click(back);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByText('Welcome video').closest('button')
      )
    );
    expect(card).not.toBeNull();
  });

  it('shows the empty state when there are no items', () => {
    helpState.items = [];
    render(<HelpGuidesTab query="" />);
    expect(
      screen.getByText("Your admin hasn't added guides yet")
    ).toBeInTheDocument();
  });

  it('requests fullscreen on the resource content and mirrors fullscreenchange', async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    const fs: { el: Element | null } = { el: null };
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fs.el,
    });
    const requestFullscreen = vi.fn((el: Element) => {
      fs.el = el;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    const exitFullscreen = vi.fn(() => {
      fs.el = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    Element.prototype.requestFullscreen = function () {
      return requestFullscreen(this);
    };
    document.exitFullscreen = exitFullscreen;

    render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Welcome video'));
    await user.click(screen.getByRole('button', { name: 'Full screen' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    const message = await screen.findByText(
      'This activity is no longer available'
    );
    expect(fs.el?.contains(message)).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Exit full screen' })
      ).toBeNull()
    );
  });
});
