import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';

const callable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => callable),
}));
vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { act } from 'react';
import { logError } from '@/utils/logError';
import { useSubControl } from './useSubControl';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

const refusal = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

const inShare = (overrides = {}) =>
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({ shareId: 'share-1', ...overrides })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  };

const started = () =>
  renderHook(() => useSubControl('quiz', 'session-1'), {
    wrapper: inShare(),
  });

beforeEach(() => vi.clearAllMocks());

describe('useSubControl', () => {
  it('names only the run and what to do with it', async () => {
    callable.mockResolvedValue({ data: { state: 'paused' } });
    const { result } = started();

    await act(() => result.current.control('pause'));

    expect(callable).toHaveBeenCalledWith({
      shareId: 'share-1',
      sessionId: 'session-1',
      kind: 'quiz',
      action: 'pause',
    });
    expect(result.current.state).toBe('paused');
  });

  it('takes the callable’s word for what the run is now', async () => {
    callable.mockResolvedValue({ data: { state: 'ended' } });
    const { result } = started();

    await act(() => result.current.control('end'));

    expect(result.current.state).toBe('ended');
  });

  it('starts out treating the run as live', () => {
    const { result } = started();
    expect(result.current.state).toBe('active');
  });

  it('does not call out outside a share', async () => {
    const { result } = renderHook(() => useSubControl('quiz', 'session-1'));
    await act(() => result.current.control('end'));
    expect(callable).not.toHaveBeenCalled();
  });

  it('does not call out without a run', async () => {
    const { result } = renderHook(() => useSubControl('quiz', null), {
      wrapper: inShare(),
    });
    await act(() => result.current.control('end'));
    expect(callable).not.toHaveBeenCalled();
  });

  // Ending twice would finalize a student's responses twice, bumping their
  // attempt count for a run they only sat once.
  it('ends once however fast the button is pressed twice', async () => {
    let settle: (value: unknown) => void = () => undefined;
    callable.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    const { result } = started();

    void act(() => {
      void result.current.control('end');
      void result.current.control('end');
    });

    expect(callable).toHaveBeenCalledTimes(1);
    act(() => settle({ data: { state: 'ended' } }));
    await waitFor(() => expect(result.current.state).toBe('ended'));
  });

  it('is busy while the call is in flight', async () => {
    let settle: (value: unknown) => void = () => undefined;
    callable.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    const { result } = started();

    void act(() => {
      void result.current.control('pause');
    });
    await waitFor(() => expect(result.current.busy).toBe(true));

    act(() => settle({ data: { state: 'paused' } }));
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it('shows the callable its own words when it refuses', async () => {
    callable.mockRejectedValue(
      refusal('functions/permission-denied', 'Your time on that run has ended.')
    );
    const { result } = started();

    await act(() => result.current.control('end'));

    expect(result.current.error).toBe('Your time on that run has ended.');
    expect(vi.mocked(logError)).not.toHaveBeenCalled();
  });

  it('logs anything else, and says something a sub can act on', async () => {
    callable.mockRejectedValue(refusal('functions/internal', 'boom'));
    const { result } = started();

    await act(() => result.current.control('end'));

    expect(result.current.error).toBe(
      'Could not change the run. Try again in a moment.'
    );
    expect(vi.mocked(logError)).toHaveBeenCalled();
  });

  it('leaves the run as it was when the call failed', async () => {
    callable.mockRejectedValue(refusal('functions/internal', 'boom'));
    const { result } = started();

    await act(() => result.current.control('end'));

    expect(result.current.state).toBe('active');
  });
});
