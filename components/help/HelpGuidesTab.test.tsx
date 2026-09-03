import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HelpResourceItem } from '@/types/helpCenter';
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

vi.mock('@/config/firebase', () => ({
  db: {},
  isAuthBypass: false,
  isConfigured: true,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ orgId: 'org-1', user: { uid: 'u1' } }),
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
  kind: 'embed',
  title: 'Item',
  description: '',
  categoryId: 'getting-started',
  order: 0,
  visible: true,
  orgId: null,
  widgetTypes: [],
  url: 'https://www.youtube.com/watch?v=abc123defgh',
  embedType: 'youtube',
  setId: null,
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
    glMocks.playerProps.length = 0;
    helpState.items = [
      makeItem({ id: 'v1', title: 'Welcome video' }),
      makeItem({
        id: 'd1',
        title: 'Board basics',
        categoryId: 'boards-widgets',
        url: 'https://docs.google.com/document/d/1/edit',
        embedType: 'doc',
        widgetTypes: ['clock'],
      }),
    ];
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

  it('filters the list by kind chips', async () => {
    const user = userEvent.setup();
    render(<HelpGuidesTab query="" />);
    expect(screen.getByText('Board basics')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Videos' }));
    expect(screen.getByText('Welcome video')).toBeInTheDocument();
    expect(screen.queryByText('Board basics')).toBeNull();
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

  it('renders a sandboxed iframe for an embed and counts the open once per id', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Welcome video'));

    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('sandbox')).toBe(
      'allow-scripts allow-forms allow-popups allow-same-origin'
    );
    expect(frame?.getAttribute('referrerpolicy')).toBe(
      'strict-origin-when-cross-origin'
    );
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

  it('links out instead of framing an arbitrary-host pdf', async () => {
    helpState.items = [
      makeItem({
        id: 'p1',
        title: 'Raw pdf',
        url: 'https://example.com/guide.pdf',
        embedType: 'pdf',
      }),
    ];
    const user = userEvent.setup();
    render(<HelpGuidesTab query="" />);
    await user.click(screen.getByText('Raw pdf'));

    expect(document.querySelector('iframe')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Open in a new tab' })
    ).toHaveAttribute('href', 'https://example.com/guide.pdf');
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
});
