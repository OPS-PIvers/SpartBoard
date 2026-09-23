import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { StepEvent } from '@/components/widgets/GuidedLearning/types/stage';

const getDocMock = vi.fn();
const setDocMock = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: (...args: unknown[]) => getDocMock(...args) as unknown,
  setDoc: (...args: unknown[]) => setDocMock(...args),
  serverTimestamp: () => 'SERVER_TS',
}));

import {
  PROGRESS_WRITE_INTERVAL_MS,
  useGuidedLearningProgress,
} from '@/hooks/useGuidedLearningProgress';

const STEP_IDS = ['s1', 's2'];
const ev = (
  partial: Partial<StepEvent> & Pick<StepEvent, 'type'>
): StepEvent => ({
  stepId: 's1',
  mode: 'try',
  ms: 0,
  ...partial,
});
const missing = { exists: () => false, data: () => undefined };
const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
const payload = (call: number) =>
  setDocMock.mock.calls[call][1] as Record<string, unknown>;

const render = (enabled = true) =>
  renderHook(() =>
    useGuidedLearningProgress({
      sessionId: 'sess',
      uid: 'u1',
      enabled,
      stepIds: STEP_IDS,
    })
  );

beforeEach(() => {
  vi.useFakeTimers();
  getDocMock.mockReset().mockResolvedValue(missing);
  setDocMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useGuidedLearningProgress', () => {
  it('writes nothing when disabled', async () => {
    const { result, unmount } = render(false);
    await settle();
    void act(() => result.current.onStepEvent(ev({ type: 'enter' })));
    void act(() => vi.advanceTimersByTime(PROGRESS_WRITE_INTERVAL_MS * 2));
    unmount();
    expect(getDocMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('writes the first batch, then at most once per interval', async () => {
    const { result } = render();
    await settle();
    void act(() => result.current.onStepEvent(ev({ type: 'enter' })));
    void act(() => vi.advanceTimersByTime(0));
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0][0]).toEqual({
      path: 'guided_learning_sessions/sess/progress/u1',
    });
    expect(setDocMock.mock.calls[0][2]).toEqual({ merge: true });
    expect(payload(0)).toMatchObject({
      mode: 'try',
      furthestStepIdx: 0,
      startedAt: 'SERVER_TS',
      updatedAt: 'SERVER_TS',
    });

    void act(() =>
      result.current.onStepEvent(ev({ type: 'misclick', xPct: 5, yPct: 5 }))
    );
    void act(() =>
      result.current.onStepEvent(ev({ type: 'enter', stepId: 's2' }))
    );
    void act(() => vi.advanceTimersByTime(PROGRESS_WRITE_INTERVAL_MS - 1));
    expect(setDocMock).toHaveBeenCalledTimes(1);
    void act(() => vi.advanceTimersByTime(1));
    expect(setDocMock).toHaveBeenCalledTimes(2);
    expect(payload(1)).not.toHaveProperty('startedAt');
    expect(payload(1)).toMatchObject({ furthestStepIdx: 1 });
  });

  it('queues events until the stored doc loads and builds on it', async () => {
    let resolveLoad: (v: unknown) => void = () => undefined;
    getDocMock.mockReturnValue(new Promise((r) => (resolveLoad = r)));
    const { result } = render();
    void act(() => result.current.onStepEvent(ev({ type: 'leave', ms: 500 })));
    expect(setDocMock).not.toHaveBeenCalled();
    resolveLoad({
      exists: () => true,
      data: () => ({ furthestStepIdx: 1, steps: { s1: { ms: 1000 } } }),
    });
    await settle();
    void act(() => vi.advanceTimersByTime(0));
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(payload(0)).not.toHaveProperty('startedAt');
    expect(payload(0)).toMatchObject({
      furthestStepIdx: 1,
      steps: { s1: { ms: 1500 } },
    });
  });

  it('flushes a pending write when the page hides and on unmount', async () => {
    const { result, unmount } = render();
    await settle();
    void act(() => result.current.onStepEvent(ev({ type: 'enter' })));
    void act(() => vi.advanceTimersByTime(0));
    void act(() => result.current.onStepEvent(ev({ type: 'hint' })));
    void act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(setDocMock).toHaveBeenCalledTimes(2);
    void act(() => result.current.onStepEvent(ev({ type: 'leave', ms: 10 })));
    unmount();
    expect(setDocMock).toHaveBeenCalledTimes(3);
  });

  it('keeps writing when the first load fails', async () => {
    getDocMock.mockRejectedValue(new Error('offline'));
    setDocMock.mockRejectedValueOnce(new Error('denied'));
    const { result } = render();
    await settle();
    void act(() => result.current.onStepEvent(ev({ type: 'enter' })));
    void act(() => vi.advanceTimersByTime(0));
    expect(payload(0)).not.toHaveProperty('startedAt');
    await settle();
    void act(() => result.current.onStepEvent(ev({ type: 'hint' })));
    void act(() => vi.advanceTimersByTime(PROGRESS_WRITE_INTERVAL_MS));
    expect(setDocMock).toHaveBeenCalledTimes(2);
    expect(payload(1)).toHaveProperty('startedAt', 'SERVER_TS');
  });

  it('skips the flush when nothing changed', async () => {
    const { unmount } = render();
    await settle();
    void act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    unmount();
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
