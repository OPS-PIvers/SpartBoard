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

const makeShare = (boardId: string): SubstituteShareDoc =>
  ({
    shareId: 'share-1',
    name: BOARD_NAMES[boardId],
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
      return { share: null, loading: false, error: readError, navSource: null };
    }
    if (stillLoading.has(boardId)) {
      return { share: null, loading: true, error: null, navSource: null };
    }
    return {
      share: makeShare(boardId),
      loading: false,
      error: null,
      navSource: NAV_SOURCE,
    };
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

describe('SubCollectionBoardScreen', () => {
  beforeEach(() => {
    stillLoading = new Set();
    readError = null;
    attempts = [];
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
      'This board is not part of the shared Collection. You are still on “Warm up”.'
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

  it('reports a board it could not read', () => {
    readError = 'This board is not part of the shared Collection.';
    renderScreen('b1');
    expect(screen.getByTestId('panel')).toHaveTextContent(
      'This board is not part of the shared Collection.'
    );
  });
});
