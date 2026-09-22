import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { SubstituteShareDoc } from '@/hooks/useSubstituteShares';

const NAV_SOURCE = {
  boardIds: ['b1', 'b2'],
  boards: [
    { id: 'b1', name: 'Warm up', sectionId: 'root', order: 0 },
    { id: 'b2', name: 'Reading', sectionId: 'root', order: 1 },
  ],
  sections: [{ id: 'root', name: '' }],
  defaultBoardId: 'b1',
};

const BOARD_NAMES: Record<string, string> = { b1: 'Warm up', b2: 'Reading' };

/** Board ids whose read has not come back yet. */
let stillLoading = new Set<string>();
/** Set to make every read fail, whichever board is asked for. */
let readError: string | null = null;
/** Every `attempt` the screen has asked the loader for, in order. */
let attempts: number[] = [];
/** What the board read reports as the content the sub is looking at. */
let readVersion = 1;
/** What the live watcher reports, i.e. what the teacher has pushed. */
let liveVersion: number | null = 1;
/** Every boardKey the provider has been given, in order. */
let boardKeys: string[] = [];

// The name carries the content version so a test can tell a re-read apart
// from a stale `shown` still holding the previous share object.
const makeShare = (boardId: string): SubstituteShareDoc =>
  ({
    shareId: 'share-1',
    name: `${BOARD_NAMES[boardId]} v${readVersion}`,
    widgets: [],
    initialState: [],
    expiresAt: Date.now() + 60_000,
    buildingId: 'ohs',
  }) as unknown as SubstituteShareDoc;

vi.mock('@/hooks/useSubstituteShares', () => ({
  // A pure function of the board asked for — no state, so the test drives it
  // by setting `stillLoading` / `readError` before the click.
  useSubstituteCollectionBoard: (
    _shareId: string,
    boardId: string,
    _buildingId: string,
    attempt = 0
  ) => {
    attempts.push(attempt);
    if (readError) {
      return {
        share: null,
        loading: false,
        error: readError,
        navSource: null,
        contentVersion: null,
      };
    }
    if (stillLoading.has(boardId)) {
      return {
        share: null,
        loading: true,
        error: null,
        navSource: null,
        contentVersion: null,
      };
    }
    return {
      share: makeShare(boardId),
      loading: false,
      error: null,
      navSource: NAV_SOURCE,
      contentVersion: readVersion,
    };
  },
  useSubShareContentVersion: () => liveVersion,
}));

vi.mock('@/components/subs/SubsDashboardProvider', () => ({
  SubsDashboardProvider: ({
    boardKey,
    children,
  }: {
    boardKey: string;
    children: React.ReactNode;
  }) => {
    boardKeys.push(boardKey);
    return <>{children}</>;
  },
}));

vi.mock('@/hooks/useSubstituteRosters', () => ({
  useSubstituteRosters: () => ({
    rosters: [],
    status: 'none',
    loadRosters: () => Promise.resolve(),
  }),
}));

vi.mock('@/components/subs/SubBoardScreen', () => ({
  SubBoardScreenContent: ({ share }: { share: SubstituteShareDoc }) => (
    <div data-testid="board">{share.name}</div>
  ),
  ExpiredOrErrorPanel: ({ message }: { message: string }) => (
    <div data-testid="panel">{message}</div>
  ),
}));

import { SubCollectionBoardScreen } from '@/components/subs/SubCollectionBoardScreen';

const renderScreen = (boardId = 'b1') =>
  render(
    <SubCollectionBoardScreen
      shareId="share-1"
      boardId={boardId}
      buildingId="ohs"
      onBackToDirectory={noop}
      onChangeBuilding={noop}
    />
  );

const noop = () => undefined;

const nextButton = () => screen.getByRole('button', { name: 'Next board' });
const prevButton = () => screen.getByRole('button', { name: 'Previous board' });
const reloadButton = () => screen.getByRole('button', { name: 'Reload' });

describe('SubCollectionBoardScreen', () => {
  beforeEach(() => {
    stillLoading = new Set();
    readError = null;
    attempts = [];
    boardKeys = [];
    readVersion = 1;
    liveVersion = 1;
  });

  it('opens the board the link named, with the collection’s navigator', () => {
    renderScreen('b2');
    expect(screen.getByTestId('board')).toHaveTextContent('Reading');
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  it('walks to the next board in place', () => {
    renderScreen('b1');
    fireEvent.click(nextButton());
    expect(screen.getByTestId('board')).toHaveTextContent('Reading');
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
  });

  // The provider holds every board's session state, so dropping back to a
  // full-screen spinner mid-walk would throw the sub's work away (plan D3).
  it('keeps the open board on screen while the next one is read', () => {
    renderScreen('b1');
    stillLoading = new Set(['b2']);
    fireEvent.click(nextButton());
    expect(screen.getByTestId('board')).toHaveTextContent('Warm up');
    expect(screen.getByRole('status')).toHaveTextContent('Opening…');
  });

  it('shows a spinner rather than a board before the first read lands', () => {
    stillLoading = new Set(['b1']);
    renderScreen('b1');
    expect(screen.queryByTestId('board')).not.toBeInTheDocument();
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  // Tearing the provider down over a network blip would lose every board's
  // session state, so the failure is reported beside the board, not instead
  // of it.
  it('keeps the open board when the next one fails to read', () => {
    renderScreen('b1');
    readError = 'This board is not part of the shared Collection.';
    fireEvent.click(nextButton());
    expect(screen.getByTestId('board')).toHaveTextContent('Warm up');
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This board is not part of the shared Collection. You are still on “Warm up v1”.'
    );
  });

  // Picking the failed board again sets state to the value it already holds,
  // so React bails out and nothing re-reads — the banner's own button is what
  // makes a retry of the same board possible.
  it('re-reads the same board when the sub tries again', () => {
    renderScreen('b1');
    readError = 'This board could not be loaded.';
    fireEvent.click(nextButton());
    expect(Math.max(...attempts)).toBe(0);

    readError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(Math.max(...attempts)).toBe(1);
    expect(screen.getByTestId('board')).toHaveTextContent('Reading');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Plan §3.5: the sub is told, not interrupted. A teacher pushing new boards
  // mid-lesson must not wipe a running timer.
  describe('a teacher pushing new boards', () => {
    const banner = () => screen.queryByText(/updated these boards/);

    it('says nothing while the content has not moved', () => {
      renderScreen('b1');
      expect(banner()).not.toBeInTheDocument();
    });

    it('offers a reload once the teacher has pushed', () => {
      liveVersion = 2;
      renderScreen('b1');
      expect(banner()).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Reload' })
      ).toBeInTheDocument();
    });

    // The whole point: the board keeps its key, so the provider keeps the
    // widgets the sub has been working on.
    it('leaves the open board alone until the sub accepts', () => {
      liveVersion = 2;
      renderScreen('b1');
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up');
      expect(new Set(boardKeys)).toEqual(new Set(['b1::1']));
    });

    it('re-keys every board and re-reads on accept', () => {
      liveVersion = 2;
      renderScreen('b1');
      readVersion = 2;
      fireEvent.click(reloadButton());
      expect(Math.max(...attempts)).toBe(1);
      expect(boardKeys.at(-1)).toBe('b1::2');
      expect(banner()).not.toBeInTheDocument();
      // The new content actually reaches the screen: `shown` has to be keyed
      // on the request, not the board, or the re-read lands nowhere.
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up v2');
    });

    // Otherwise stepping to the next board would silently take the update and
    // discard what the sub had done on the boards behind it.
    it('keeps asking when the sub walks to another board instead', () => {
      liveVersion = 2;
      renderScreen('b1');
      readVersion = 2;
      fireEvent.click(nextButton());
      expect(screen.getByTestId('board')).toHaveTextContent('Reading');
      expect(banner()).toBeInTheDocument();
      expect(boardKeys.at(-1)).toBe('b2::1');
    });

    // The provider keeps widgets per board, but the background, display
    // settings and viewport size come from the share doc, so serving a fresh
    // read to a board the sub has already worked in would re-dress it around
    // their own work without them accepting anything.
    it('shows a board the sub goes back to exactly as they left it', () => {
      liveVersion = 2;
      renderScreen('b1');
      readVersion = 2;
      fireEvent.click(nextButton());
      expect(screen.getByTestId('board')).toHaveTextContent('Reading v2');
      fireEvent.click(prevButton());
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up v1');
      expect(boardKeys.at(-1)).toBe('b1::1');
      expect(banner()).toBeInTheDocument();
    });

    // Re-keying the board before the new read lands would reseed the provider
    // from the copy the sub was already looking at, and the read that follows
    // would find the key already there and never reseed — Reload would clear
    // the banner and change nothing.
    it('waits for the new content before re-keying on accept', () => {
      liveVersion = 2;
      const { rerender } = renderScreen('b1');
      readVersion = 2;
      stillLoading = new Set(['b1']);
      fireEvent.click(reloadButton());
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up v1');
      expect(boardKeys).not.toContain('b1::2');
      expect(screen.getByRole('status')).toHaveTextContent('Opening…');

      stillLoading = new Set();
      rerender(
        <SubCollectionBoardScreen
          shareId="share-1"
          boardId="b1"
          buildingId="ohs"
          onBackToDirectory={noop}
          onChangeBuilding={noop}
        />
      );
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up v2');
      expect(boardKeys.at(-1)).toBe('b1::2');
    });

    // A network blip must not cost the sub their work: accepting a version
    // whose read never arrived would re-key the board and reseed it from the
    // frozen copy with nothing new to show.
    it('keeps the board and its work when the reload fails', () => {
      liveVersion = 2;
      renderScreen('b1');
      readError = 'This board could not be loaded.';
      fireEvent.click(reloadButton());
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up v1');
      expect(boardKeys.at(-1)).toBe('b1::1');
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(banner()).toBeInTheDocument();
    });

    // The reload's read is cancelled when the sub navigates away, so leaving a
    // pending accept alive would let it complete on a later visit and replace
    // boards the sub has worked on in between.
    it('abandons a reload the sub walks away from', () => {
      liveVersion = 2;
      renderScreen('b1');
      readVersion = 2;
      stillLoading = new Set(['b1']);
      fireEvent.click(reloadButton());
      fireEvent.click(nextButton());
      expect(screen.getByTestId('board')).toHaveTextContent('Reading v2');

      stillLoading = new Set();
      fireEvent.click(prevButton());
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up v1');
      expect(banner()).toBeInTheDocument();
      fireEvent.click(nextButton());
      expect(boardKeys.at(-1)).toBe('b2::1');
    });

    it('carries the reload onto the retry when its read fails', () => {
      liveVersion = 2;
      renderScreen('b1');
      readVersion = 2;
      readError = 'This board could not be loaded.';
      fireEvent.click(reloadButton());
      expect(boardKeys.at(-1)).toBe('b1::1');

      readError = null;
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(screen.getByTestId('board')).toHaveTextContent('Warm up v2');
      expect(boardKeys.at(-1)).toBe('b1::2');
      expect(banner()).not.toBeInTheDocument();
    });

    it('says nothing when the watcher has nothing to report', () => {
      liveVersion = null;
      renderScreen('b1');
      expect(banner()).not.toBeInTheDocument();
    });
  });

  it('reports a board it could not read', () => {
    readError = 'This board is not part of the shared Collection.';
    renderScreen('b1');
    expect(screen.getByTestId('panel')).toHaveTextContent(
      'This board is not part of the shared Collection.'
    );
  });
});
