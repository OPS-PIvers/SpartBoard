import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResultsTabWarnings } from '@/hooks/useResultsTabWarnings';

const updateDoc = vi.fn();
const docMock = vi.fn();
const docRef = { __mockRef: true };
const incrementSentinel = (value: number) => ({ __increment: value });
vi.mock('firebase/firestore', async (orig) => {
  const actual = await (
    orig as () => Promise<typeof import('firebase/firestore')>
  )();
  return {
    ...actual,
    doc: (...args: unknown[]): unknown => {
      docMock(...args);
      return docRef;
    },
    updateDoc: (...args: unknown[]): unknown => updateDoc(...args) as unknown,
    increment: (value: number) => incrementSentinel(value),
  };
});

describe('useResultsTabWarnings', () => {
  beforeEach(() => {
    updateDoc.mockReset().mockResolvedValue(undefined);
    docMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when enabled=false', () => {
    renderHook(() =>
      useResultsTabWarnings({
        enabled: false,
        threshold: 3,
        currentWarnings: 0,
        responseDocPath: 'quiz_sessions/x/responses/y',
      })
    );
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('increments warnings on visibility hide → show transition', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    renderHook(() =>
      useResultsTabWarnings({
        enabled: true,
        threshold: 3,
        currentWarnings: 0,
        responseDocPath: 'quiz_sessions/x/responses/y',
      })
    );
    // First go hidden so the hook observes the exit…
    await act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      return Promise.resolve();
    });
    // …then back to visible to trigger the increment.
    await act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      return Promise.resolve();
    });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({
      resultsTabWarnings: { __increment: 1 },
    });
    // Pin the path forwarding — production callers build the path without a
    // leading slash, matching the Firestore `doc(db, path)` contract.
    expect(docMock).toHaveBeenCalledWith(
      expect.anything(),
      'quiz_sessions/x/responses/y'
    );
  });

  it('flips resultsLockedOut=true when warnings reach threshold', async () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    renderHook(() =>
      useResultsTabWarnings({
        enabled: true,
        threshold: 3,
        currentWarnings: 2,
        responseDocPath: 'quiz_sessions/x/responses/y',
      })
    );
    await act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      return Promise.resolve();
    });
    await act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      return Promise.resolve();
    });
    expect(updateDoc.mock.calls[0][1]).toMatchObject({
      resultsTabWarnings: { __increment: 1 },
      resultsLockedOut: true,
      resultsLockedOutAt: expect.any(Number) as unknown,
    });
  });

  it('does not increment further once already locked out', () => {
    renderHook(() =>
      useResultsTabWarnings({
        enabled: true,
        threshold: 3,
        currentWarnings: 3,
        lockedOut: true,
        responseDocPath: 'quiz_sessions/x/responses/y',
      })
    );
    document.dispatchEvent(new Event('visibilitychange'));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('flips resultsLockedOut on the 3rd rapid warning even when only the 1st write has been reflected in a snapshot', async () => {
    // Reproduces the race the hook's own comments claim to guard against:
    // a burst of hide/return events fires 3 local increments before the
    // Firestore round-trip for any of them lands. A snapshot reflecting
    // ONLY the first write (currentWarnings: 0 -> 1) arrives between the
    // 2nd and 3rd local events. The pending local tally for the *second*
    // in-flight write must survive that snapshot — it hasn't landed yet.
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    const cycle = async () => {
      await act(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'hidden',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        return Promise.resolve();
      });
      await act(() => {
        Object.defineProperty(document, 'visibilityState', {
          value: 'visible',
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        return Promise.resolve();
      });
    };

    const { rerender } = renderHook(
      (props: { currentWarnings: number }) =>
        useResultsTabWarnings({
          enabled: true,
          threshold: 3,
          currentWarnings: props.currentWarnings,
          responseDocPath: 'quiz_sessions/x/responses/y',
        }),
      { initialProps: { currentWarnings: 0 } }
    );

    await cycle(); // local write #1 (server will eventually read 1)
    await cycle(); // local write #2, still in flight (server will eventually read 2)

    // Simulate write #1's snapshot landing — the ONLY write reflected so far.
    rerender({ currentWarnings: 1 });

    await cycle(); // local write #3 — this is the event that should cross threshold=3

    expect(updateDoc).toHaveBeenCalledTimes(3);
    expect(updateDoc.mock.calls[2][1]).toMatchObject({
      resultsTabWarnings: { __increment: 1 },
      resultsLockedOut: true,
      resultsLockedOutAt: expect.any(Number) as unknown,
    });
  });
});
