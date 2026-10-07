/* eslint-disable @typescript-eslint/require-await -- mock callable returns
   Promise-shaped data without awaiting; matches production contract. */
/**
 * Tests for `useLtiSessionNames` — the NRPS teacher-side name resolver hook.
 *
 * Pins: (1) it resolves `{ uid → name }` when enabled; (2) it makes ZERO
 * callable invocations when `enabled` is false (the `ltiNrps` gate keeps every
 * non-LTI session free of the round trip); (3) it stays silent (no call) when
 * the sessionId is absent; (4) a callable failure logs and degrades to an empty
 * map rather than throwing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const loggedErrors: { scope: string; error: unknown; ctx?: unknown }[] = [];
vi.mock('@/utils/logError', () => ({
  logError: (scope: string, error: unknown, ctx?: unknown) => {
    loggedErrors.push({ scope, error, ctx });
  },
}));

type CallableInput = { sessionId: string };
interface CallableResult {
  names: Record<string, { givenName: string; familyName: string }>;
}
type CallableReturn =
  | Promise<{ data: CallableResult }>
  | { data: CallableResult };
type CallableHandler = (input: CallableInput) => CallableReturn;

let callCount = 0;
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, _name: string) => {
    return (data: CallableInput) => {
      callCount++;
      const state = (
        globalThis as { __ltiNamesMock?: { handler: CallableHandler } }
      ).__ltiNamesMock;
      if (!state?.handler) throw new Error('callable handler not set for test');
      return Promise.resolve(state.handler(data));
    };
  },
}));

vi.mock('@/config/firebase', () => ({
  functions: {},
  auth: {
    get currentUser() {
      return { uid: 'teacher-1' };
    },
  },
}));

const setHandler = (handler: CallableHandler): void => {
  (
    globalThis as { __ltiNamesMock?: { handler: CallableHandler } }
  ).__ltiNamesMock = { handler };
};

import { useLtiSessionNames } from '@/hooks/useLtiSessionNames';
import { ltiSectionsKey } from '@/utils/ltiSectionsKey';

let uniqueSessionId = 0;
const nextSessionId = () => `session-${++uniqueSessionId}`;

beforeEach(() => {
  loggedErrors.length = 0;
  callCount = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLtiSessionNames', () => {
  it('resolves names when enabled', async () => {
    setHandler(() => ({
      data: {
        names: {
          'uid-a': { givenName: 'Ada', familyName: 'Lovelace' },
          'uid-b': { givenName: 'Grace', familyName: 'Hopper' },
        },
      },
    }));

    const sid = nextSessionId();
    const { result } = renderHook(() => useLtiSessionNames(sid, true));

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('uid-a')?.givenName).toBe('Ada');
    expect(result.current.get('uid-b')?.familyName).toBe('Hopper');
    expect(callCount).toBe(1);
  });

  it('makes NO callable invocation when disabled (the ltiNrps gate)', async () => {
    setHandler(() => ({ data: { names: {} } }));
    const sid = nextSessionId();
    const { result } = renderHook(() => useLtiSessionNames(sid, false));
    expect(result.current.size).toBe(0);
    expect(callCount).toBe(0);
  });

  it('makes NO call when the sessionId is absent', async () => {
    setHandler(() => ({ data: { names: {} } }));
    const { result } = renderHook(() => useLtiSessionNames(null, true));
    expect(result.current.size).toBe(0);
    expect(callCount).toBe(0);
  });

  it('degrades to an empty map and logs when the callable fails', async () => {
    setHandler(() => Promise.reject(new Error('roster service unavailable')));
    const sid = nextSessionId();
    const { result } = renderHook(() => useLtiSessionNames(sid, true));

    await waitFor(() => expect(loggedErrors).toHaveLength(1));
    expect(loggedErrors[0].scope).toBe('useLtiSessionNames.fetch');
    expect(result.current.size).toBe(0);
  });

  it('refetches when a new Schoology section launches into the same session', async () => {
    let calls = 0;
    setHandler(() => {
      calls++;
      const names: CallableResult['names'] = {
        'third-hour': { givenName: 'Ada', familyName: 'L' },
      };
      if (calls > 1)
        names['fifth-hour'] = { givenName: 'Grace', familyName: 'H' };
      return { data: { names } };
    });
    const sid = nextSessionId();
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useLtiSessionNames(sid, true, 'quiz', key),
      { initialProps: { key: 'schoology:3' } }
    );
    await waitFor(() => expect(result.current.has('third-hour')).toBe(true));

    rerender({ key: 'schoology:3,schoology:5' });
    await waitFor(() => expect(result.current.has('fifth-hour')).toBe(true));
    expect(callCount).toBe(2);
  });
});

describe('ltiSectionsKey', () => {
  it('collects Schoology sections from classIds and the period map, sorted', () => {
    expect(
      ltiSectionsKey({
        ltiNrps: true,
        classIds: ['CL-1', 'schoology:5'],
        classPeriodByClassId: {
          'CL-1': 'Period 1',
          'schoology:3': 'Section 3',
          'schoology:5': 'Section 5',
        },
      })
    ).toBe('schoology:3,schoology:5');
    expect(ltiSectionsKey(null)).toBe('');
  });

  it('is empty for non-LTI sessions and skips non-string class ids', () => {
    expect(ltiSectionsKey({ classIds: ['schoology:5'] })).toBe('');
    expect(
      ltiSectionsKey({ ltiNrps: true, classIds: [null, 7, 'schoology:2'] })
    ).toBe('schoology:2');
    expect(ltiSectionsKey({ ltiNrps: true, classIds: 'schoology:2' })).toBe('');
  });
});
