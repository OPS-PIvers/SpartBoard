import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import type { WebTourCheckProgress } from './extensionProtocol';
import {
  CHECK_RECONNECT_MS,
  CHECK_RECONNECTS,
  useWebTourCheck,
} from './useWebTourCheck';

interface Watch {
  onEvent: (e: WebTourCheckProgress) => void;
  onGone: () => void;
  stop: ReturnType<typeof vi.fn>;
}

const ext = vi.hoisted(() => ({
  watches: [] as Watch[],
  startWebTour: vi.fn(() => Promise.resolve({ ok: true, tabId: 3 })),
}));
vi.mock('./extensionClient', () => ({
  startWebTour: ext.startWebTour,
  watchWebTourCheck: (
    _setId: string,
    onEvent: Watch['onEvent'],
    onGone: Watch['onGone']
  ) => {
    const stop = vi.fn();
    ext.watches.push({ onEvent, onGone, stop });
    return stop;
  },
}));

const tour: GuidedLearningSet = {
  id: 't1',
  title: 'Materials',
  imageUrls: [],
  mode: 'tour',
  surface: 'web',
  createdAt: 1,
  updatedAt: 1,
  steps: [
    {
      id: 's1',
      xPct: 0,
      yPct: 0,
      imageIndex: 0,
      interactionType: 'tooltip',
      web: {
        urlPattern: 'https://orono.schoology.com/home',
        action: 'click',
        locator: { role: 'link', name: 'Grades' },
      },
    },
  ],
};

const setup = () => {
  const handlers = {
    onStart: vi.fn(),
    onResult: vi.fn(),
    onStatus: vi.fn(),
  };
  const hook = renderHook(() => useWebTourCheck(handlers));
  return { handlers, hook };
};

const runIdOf = (call = 0) =>
  (ext.startWebTour.mock.calls[call] as unknown as unknown[])[3] as string;

const step = (runId: string, result: 'found' | 'none' = 'found') =>
  ({
    type: 'web-tour/check-step',
    setId: 't1',
    runId,
    stepIndex: 0,
    stepId: 's1',
    result,
  }) as const;

beforeEach(() => {
  ext.watches = [];
  ext.startWebTour.mockClear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('useWebTourCheck', () => {
  it('starts a check run with its own id and drops messages from other runs', async () => {
    const { handlers, hook } = setup();
    await act(() => hook.result.current.start(tour));
    const runId = runIdOf();
    expect(runId).toMatch(/^[A-Za-z0-9-]+$/);
    expect(hook.result.current.checking).toBe(true);
    const watch = ext.watches[0];
    // An old check tab's replayed end and results belong to another run.
    act(() => {
      watch.onEvent({ ...step('old'), result: 'none' });
      watch.onEvent({
        type: 'web-tour/check-end',
        setId: 't1',
        runId: 'old',
        stepIndex: 0,
        done: true,
      });
    });
    expect(handlers.onResult).not.toHaveBeenCalled();
    expect(hook.result.current.checking).toBe(true);
    act(() => watch.onEvent(step(runId)));
    expect(handlers.onResult).toHaveBeenCalledWith(
      expect.any(String),
      's1',
      'found'
    );
    act(() =>
      watch.onEvent({
        type: 'web-tour/check-end',
        setId: 't1',
        runId,
        stepIndex: 0,
        done: true,
      })
    );
    expect(hook.result.current.checking).toBe(false);
    expect(handlers.onStatus).toHaveBeenLastCalledWith('Check finished.');
  });

  it('a second run ignores the first one', async () => {
    const { handlers, hook } = setup();
    await act(() => hook.result.current.start(tour));
    const first = runIdOf(0);
    await act(() => hook.result.current.start(tour));
    expect(ext.watches[0].stop).toHaveBeenCalled();
    act(() => ext.watches[1].onEvent(step(first)));
    expect(handlers.onResult).not.toHaveBeenCalled();
    act(() => ext.watches[1].onEvent(step(runIdOf(1))));
    expect(handlers.onResult).toHaveBeenCalledTimes(1);
  });

  it('counts only reconnects that fail in a row', async () => {
    const { handlers, hook } = setup();
    await act(() => hook.result.current.start(tour));
    const runId = runIdOf();
    // Many worker restarts, each followed by a port that delivers, never give up.
    for (let i = 0; i < CHECK_RECONNECTS * 3; i++) {
      act(() => ext.watches.at(-1)?.onGone());
      act(() => {
        vi.advanceTimersByTime(CHECK_RECONNECT_MS);
      });
      act(() => ext.watches.at(-1)?.onEvent(step(runId)));
    }
    expect(hook.result.current.checking).toBe(true);
    // A port that stays open past the wait counts as working too.
    for (let i = 0; i < CHECK_RECONNECTS * 2; i++) {
      act(() => {
        vi.advanceTimersByTime(CHECK_RECONNECT_MS);
      });
      act(() => ext.watches.at(-1)?.onGone());
      act(() => {
        vi.advanceTimersByTime(CHECK_RECONNECT_MS);
      });
    }
    expect(hook.result.current.checking).toBe(true);
    // Ports that drop at once, in a row, use the budget up.
    for (let i = 0; i <= CHECK_RECONNECTS; i++) {
      act(() => ext.watches.at(-1)?.onGone());
      act(() => {
        vi.advanceTimersByTime(CHECK_RECONNECT_MS - 1);
      });
      act(() => {
        vi.advanceTimersByTime(1);
      });
    }
    expect(hook.result.current.checking).toBe(false);
    expect(handlers.onStatus).toHaveBeenLastCalledWith(
      'Lost touch with the extension. Check the tour again.'
    );
  });

  it('cancels a pending reconnect when the editor closes', async () => {
    const { hook } = setup();
    await act(() => hook.result.current.start(tour));
    act(() => ext.watches[0].onGone());
    hook.unmount();
    act(() => {
      vi.advanceTimersByTime(CHECK_RECONNECT_MS * 2);
    });
    expect(ext.watches).toHaveLength(1);
  });

  it('reports a start the extension refused', async () => {
    ext.startWebTour.mockResolvedValueOnce({
      ok: false,
      error: 'invalid',
    } as never);
    const { handlers, hook } = setup();
    await act(() => hook.result.current.start(tour));
    expect(hook.result.current.checking).toBe(false);
    expect(handlers.onStatus).toHaveBeenLastCalledWith(
      "The check couldn't start."
    );
    expect(ext.watches[0].stop).toHaveBeenCalled();
  });
});
