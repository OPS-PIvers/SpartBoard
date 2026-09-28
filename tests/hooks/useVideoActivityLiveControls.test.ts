import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import { doc, updateDoc } from 'firebase/firestore';
import { useVideoActivityLiveControls } from '@/hooks/useVideoActivityLiveControls';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  updateDoc: vi.fn(() => Promise.resolve()),
  arrayUnion: vi.fn((...v: unknown[]) => ({ __arrayUnion: v })),
  arrayRemove: vi.fn((...v: unknown[]) => ({ __arrayRemove: v })),
}));

vi.mock('@/config/firebase', () => ({ db: { __mock: 'db' } }));

const mockUpdateDoc = updateDoc as Mock;
const mockDoc = doc as Mock;

const lastPatch = (): Record<string, unknown> =>
  mockUpdateDoc.mock.calls.at(-1)?.[1] as Record<string, unknown>;

describe('useVideoActivityLiveControls', () => {
  beforeEach(() => {
    mockUpdateDoc.mockClear();
    mockDoc.mockClear();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  const controls = () =>
    renderHook(() => useVideoActivityLiveControls('s1')).result.current;

  it('start moves the session out of the lobby', async () => {
    await controls().start();
    expect(mockDoc).toHaveBeenCalledWith(
      { __mock: 'db' },
      'video_activity_sessions',
      's1'
    );
    expect(lastPatch()).toEqual({ status: 'active', 'live.updatedAt': 1000 });
  });

  it('openQuestion opens, resets flags, records asked and unskips', async () => {
    await controls().openQuestion('q2', 42.5);
    expect(lastPatch()).toEqual({
      'live.currentQuestionId': 'q2',
      'live.questionPhase': 'open',
      'live.resultsShown': false,
      'live.answerRevealed': false,
      'live.askedQuestionIds': { __arrayUnion: ['q2'] },
      'live.skippedQuestionIds': { __arrayRemove: ['q2'] },
      'live.updatedAt': 1000,
      'live.playheadSeconds': 42.5,
    });
  });

  it('resume closes the question', async () => {
    await controls().resume(50);
    expect(lastPatch()).toEqual({
      'live.currentQuestionId': null,
      'live.questionPhase': 'closed',
      'live.updatedAt': 1000,
      'live.playheadSeconds': 50,
    });
  });

  it('toggles results and the answer', async () => {
    await controls().showResults(true);
    expect(lastPatch()).toEqual({
      'live.resultsShown': true,
      'live.updatedAt': 1000,
    });
    await controls().revealAnswer(false);
    expect(lastPatch()).toEqual({
      'live.answerRevealed': false,
      'live.updatedAt': 1000,
    });
  });

  it('skip unions ids and ignores an empty list', async () => {
    await controls().skip([], 10);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    await controls().skip(['q1', 'q3'], 31);
    expect(lastPatch()).toEqual({
      'live.skippedQuestionIds': { __arrayUnion: ['q1', 'q3'] },
      'live.updatedAt': 1000,
      'live.playheadSeconds': 31,
    });
  });

  it('end closes the question and ends the session', async () => {
    await controls().end(99);
    expect(lastPatch()).toEqual({
      status: 'ended',
      endedAt: 1000,
      'live.currentQuestionId': null,
      'live.questionPhase': 'closed',
      'live.updatedAt': 1000,
      'live.playheadSeconds': 99,
    });
  });

  it('does nothing without a session id', async () => {
    const { result } = renderHook(() => useVideoActivityLiveControls(null));
    await result.current.start();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
