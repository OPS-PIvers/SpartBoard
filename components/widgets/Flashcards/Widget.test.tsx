import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FlashcardsWidget } from './Widget';
import { useFlashcardSets } from '@/hooks/useFlashcardSets';
import { useFlashcardAssignments } from '@/hooks/useFlashcardAssignments';
import { useFolders } from '@/hooks/useFolders';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { noSubShareKey } from '@/tests/testHelpers/subShareContent';
import type { FlashcardSet, WidgetData } from '@/types';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    ensureGoogleScope: vi.fn(),
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast: vi.fn(),
    updateWidget: vi.fn(),
    rosters: [],
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/hooks/useGooglePicker', () => ({
  useGooglePicker: () => ({ openPicker: vi.fn() }),
}));
vi.mock('@/hooks/useFlashcardSets', () => ({
  useFlashcardSets: vi.fn(),
  FlashcardStudySyncError: class extends Error {},
}));
vi.mock('@/hooks/useFlashcardAssignments', () => ({
  useFlashcardAssignments: vi.fn(),
}));
vi.mock('@/hooks/useFolders', () => ({ useFolders: vi.fn() }));
vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
vi.mock('@/components/widgets/WidgetLayout', () => ({
  WidgetLayout: ({ content }: { content: React.ReactNode }) => (
    <div>{content}</div>
  ),
}));

// Stubbed so the tests can assert on what the widget hands the player rather
// than on the player's own markup.
// The panel has its own suite; here it only matters whether it is mounted,
// and its real settings hook would reach for Firestore.
vi.mock('@/components/subs/SubLaunchPanel', () => ({
  SubLaunchPanel: ({ kind, itemId }: { kind: string; itemId: string }) => (
    <div data-testid="sub-launch" data-kind={kind} data-item={itemId} />
  ),
}));

vi.mock('@/components/flashcards/FlashcardPlayer', () => ({
  FlashcardPlayer: ({
    cards,
    onBack,
    onSettingsChange,
  }: {
    cards: { term: string }[];
    onBack?: () => void;
    onSettingsChange?: () => void;
  }) => (
    <div data-testid="player">
      <span>{`${cards.length} cards: ${cards.map((c) => c.term).join(', ')}`}</span>
      {onBack ? <button>Back to library</button> : null}
      {onSettingsChange ? <span>settings writable</span> : null}
    </div>
  ),
}));

const ownSet: FlashcardSet = {
  id: 's-1',
  title: 'Cell biology',
  termLanguage: 'en',
  definitionLanguage: 'en',
  cards: [
    { id: 'c1', term: 'Mitochondria', definition: 'Powerhouse' },
    { id: 'c2', term: 'Ribosome', definition: 'Builds proteins' },
  ],
  createdAt: 1,
  updatedAt: 2,
};

const widget = (presentSetId: string | null): WidgetData =>
  ({
    id: 'widget-1',
    type: 'flashcards',
    config: { presentSetId, view: presentSetId ? 'present' : 'library' },
  }) as unknown as WidgetData;

function mockHooks() {
  vi.clearAllMocks();
  vi.mocked(useFlashcardSets).mockReturnValue({
    sets: [ownSet],
    loading: false,
    error: null,
    saveSet: vi.fn(),
    deleteSet: vi.fn(),
    publishSet: vi.fn(),
    revokeShare: vi.fn(),
  } as unknown as ReturnType<typeof useFlashcardSets>);
  vi.mocked(useFlashcardAssignments).mockReturnValue({
    assignments: [],
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useFlashcardAssignments>);
  vi.mocked(useFolders).mockReturnValue({
    folders: [],
  } as unknown as ReturnType<typeof useFolders>);
}

// `/subs` renders the teacher's board, so the sub sees the set the teacher was
// presenting and none of the library, assigning or results around it.
describe('FlashcardsWidget — inside a sub share', () => {
  beforeEach(mockHooks);

  function InShare({
    payload,
    children,
  }: {
    payload: unknown;
    children: React.ReactNode;
  }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          loadKey: noSubShareKey,
          load: () => Promise.resolve(payload),
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  }

  const bundled = {
    set: {
      id: 's-1',
      title: 'Cell biology',
      termLanguage: 'en',
      definitionLanguage: 'en',
      cards: [{ id: 'c1', term: 'Bundled term', definition: 'Bundled' }],
    },
  };

  it('presents the bundled set, not one from the viewer’s library', async () => {
    render(
      <InShare payload={bundled}>
        <FlashcardsWidget widget={widget('s-1')} />
      </InShare>
    );

    expect(
      await screen.findByText('1 cards: Bundled term')
    ).toBeInTheDocument();
  });

  it('opens no listener against the substitute’s own account', async () => {
    render(
      <InShare payload={bundled}>
        <FlashcardsWidget widget={widget('s-1')} />
      </InShare>
    );

    await screen.findByTestId('player');
    expect(vi.mocked(useFlashcardSets)).toHaveBeenCalledWith(undefined);
    expect(vi.mocked(useFlashcardAssignments)).toHaveBeenCalledWith(undefined);
    expect(vi.mocked(useFolders)).toHaveBeenCalledWith(undefined, 'flashcards');
  });

  it('offers no way back to a library and no settings to save', async () => {
    render(
      <InShare payload={bundled}>
        <FlashcardsWidget widget={widget('s-1')} />
      </InShare>
    );

    await screen.findByTestId('player');
    expect(screen.queryByText('Back to library')).not.toBeInTheDocument();
    expect(screen.queryByText('settings writable')).not.toBeInTheDocument();
  });

  it('presents the set even when the teacher left the widget on the library', async () => {
    const onLibrary = {
      ...widget('s-1'),
      config: { presentSetId: 's-1', view: 'library' },
    } as unknown as WidgetData;

    render(
      <InShare payload={bundled}>
        <FlashcardsWidget widget={onLibrary} />
      </InShare>
    );

    expect(await screen.findByTestId('player')).toBeInTheDocument();
  });

  it('says so when the widget had no set open', async () => {
    render(
      <InShare payload={null}>
        <FlashcardsWidget widget={widget(null)} />
      </InShare>
    );

    expect(await screen.findByText('No flashcards')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).not.toBeInTheDocument();
  });
});

describe('FlashcardsWidget — starting a shared set', () => {
  beforeEach(mockHooks);

  function InShare({
    payload,
    children,
  }: {
    payload: unknown;
    children: React.ReactNode;
  }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          loadKey: noSubShareKey,
          load: () => Promise.resolve(payload),
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  }

  const bundled = {
    set: {
      id: 's-1',
      title: 'Cell biology',
      termLanguage: 'en',
      definitionLanguage: 'en',
      cards: [{ id: 'c1', term: 'Bundled term', definition: 'Bundled' }],
    },
  };

  it('offers to start the set the sub is presenting', async () => {
    render(
      <InShare payload={bundled}>
        <FlashcardsWidget widget={widget('s-1')} />
      </InShare>
    );

    const panel = await screen.findByTestId('sub-launch');
    expect(panel).toHaveAttribute('data-kind', 'flashcards');
    expect(panel).toHaveAttribute('data-item', 's-1');
  });

  // The teacher has Assign; a second way in would be two paths to keep right.
  it('offers nothing on the teacher\u2019s own board', () => {
    render(<FlashcardsWidget widget={widget('s-1')} />);

    expect(screen.queryByTestId('sub-launch')).not.toBeInTheDocument();
  });
});

describe('FlashcardsWidget — on the teacher’s own board', () => {
  beforeEach(mockHooks);

  it('presents their own set, with the library and settings available', () => {
    render(<FlashcardsWidget widget={widget('s-1')} />);

    expect(
      screen.getByText('2 cards: Mitochondria, Ribosome')
    ).toBeInTheDocument();
    expect(screen.getByText('Back to library')).toBeInTheDocument();
    expect(screen.getByText('settings writable')).toBeInTheDocument();
    expect(vi.mocked(useFlashcardSets)).toHaveBeenCalledWith('teacher-1');
  });
});
