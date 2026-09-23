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
import { useSubLaunch } from './useSubLaunch';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

const refusal = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

const inShare = (overrides = {}) =>
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          boardId: 'board-1',
          ...overrides,
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  };

const launched = () =>
  renderHook(() => useSubLaunch('quiz', 'w1', 'q-1'), {
    wrapper: inShare(),
  });

beforeEach(() => vi.clearAllMocks());

describe('useSubLaunch', () => {
  it('sends only the item, board and rosters the sub picked', async () => {
    callable.mockResolvedValue({ data: { sessionId: 's1', code: 'AB12CD' } });
    const { result } = launched();

    await act(() => result.current.launch(['roster-1']));

    expect(callable).toHaveBeenCalledWith({
      shareId: 'share-1',
      boardId: 'board-1',
      widgetId: 'w1',
      kind: 'quiz',
      itemId: 'q-1',
      rosterIds: ['roster-1'],
    });
    expect(result.current.status).toBe('launched');
    expect(result.current.result).toEqual({ sessionId: 's1', code: 'AB12CD' });
  });

  it('does not call out outside a share', async () => {
    const { result } = renderHook(() => useSubLaunch('quiz', 'w1', 'q-1'));
    await act(() => result.current.launch(['roster-1']));
    expect(callable).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('does not call out without a board', async () => {
    const { result } = renderHook(() => useSubLaunch('quiz', 'w1', 'q-1'), {
      wrapper: inShare({ boardId: null }),
    });
    await act(() => result.current.launch(['roster-1']));
    expect(callable).not.toHaveBeenCalled();
  });

  it('does not call out without an item', async () => {
    const { result } = renderHook(() => useSubLaunch('quiz', 'w1', null), {
      wrapper: inShare(),
    });
    await act(() => result.current.launch(['roster-1']));
    expect(callable).not.toHaveBeenCalled();
  });

  // The callable would refuse an empty roster list anyway; not asking spares
  // the substitute a round trip that ends in an error they cannot fix.
  it('does not call out without a class', async () => {
    const { result } = launched();
    await act(() => result.current.launch([]));
    expect(callable).not.toHaveBeenCalled();
  });

  it('is launching while the call is in flight', async () => {
    let settle: (value: unknown) => void = () => undefined;
    callable.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    const { result } = launched();

    void act(() => {
      void result.current.launch(['roster-1']);
    });
    await waitFor(() => expect(result.current.status).toBe('launching'));

    act(() => settle({ data: { sessionId: 's1', code: 'AB12CD' } }));
    await waitFor(() => expect(result.current.status).toBe('launched'));
  });

  // The callable's refusals are written for this reader and tell apart an
  // expired share, one that does not name them, and a switched-off feature.
  it('shows the callable its own words when it refuses', async () => {
    callable.mockRejectedValue(
      refusal('functions/permission-denied', 'This share has expired.')
    );
    const { result } = launched();

    await act(() => result.current.launch(['roster-1']));

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('This share has expired.');
  });

  it('does not report a refusal as a fault', async () => {
    callable.mockRejectedValue(
      refusal('functions/permission-denied', 'This share has expired.')
    );
    const { result } = launched();

    await act(() => result.current.launch(['roster-1']));

    expect(vi.mocked(logError)).not.toHaveBeenCalled();
  });

  it('logs anything else, and says something a sub can act on', async () => {
    callable.mockRejectedValue(refusal('functions/internal', 'boom'));
    const { result } = launched();

    await act(() => result.current.launch(['roster-1']));

    expect(result.current.error).toBe(
      'Could not start the activity. Try again in a moment.'
    );
    expect(vi.mocked(logError)).toHaveBeenCalled();
  });

  it('points a rejected activity back at the teacher', async () => {
    callable.mockRejectedValue(
      refusal('functions/invalid-argument', 'kind is not launchable')
    );
    const { result } = launched();

    await act(() => result.current.launch(['roster-1']));

    expect(result.current.error).toBe(
      'Something about this activity stopped it from starting. Your teacher can start it themselves.'
    );
  });

  it('never shows a refusal with no message of its own', async () => {
    callable.mockRejectedValue(refusal('functions/permission-denied', ''));
    const { result } = launched();

    await act(() => result.current.launch(['roster-1']));

    expect(result.current.error).toBe('You cannot start this activity.');
  });

  it('goes back to idle so the sub can try again', async () => {
    callable.mockRejectedValue(refusal('functions/internal', 'boom'));
    const { result } = launched();

    await act(() => result.current.launch(['roster-1']));
    act(() => result.current.reset());

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBeNull();
  });
});
