/* eslint-disable @typescript-eslint/require-await -- mock callable returns
   Promise-shaped data without awaiting; matches production contract. */
/**
 * Tests for `useAssignmentPseudonymsMulti` — partial-resolution behavior.
 *
 * The whole point of the recent hardening was that a single failing classId
 * must NOT zero out the merged name map for the surviving classes. The
 * `Promise.allSettled` + `.catch` chain is the only thing standing between
 * "one revoked share" and "every student exported as 'Student'" — these
 * tests lock that contract.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const loggedErrors: { scope: string; error: unknown; ctx?: unknown }[] = [];
vi.mock('@/utils/logError', () => ({
  logError: (scope: string, error: unknown, ctx?: unknown) => {
    loggedErrors.push({ scope, error, ctx });
  },
}));

// Per-classId callable behavior.
type CallableInput = { assignmentId: string; classId: string; orgId?: string };
interface PseudonymEntry {
  studentUid: string;
  assignmentPseudonym: string;
  givenName: string;
  familyName: string;
}
interface CallableResult {
  pseudonyms: Record<string, PseudonymEntry>;
}
type CallableReturn =
  | Promise<{ data: CallableResult }>
  | { data: CallableResult };
type CallableHandler = (input: CallableInput) => CallableReturn;

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, _name: string) => {
    return (data: CallableInput) => {
      const state = (
        globalThis as { __pseudonymsMock?: { handler: CallableHandler } }
      ).__pseudonymsMock;
      if (!state?.handler) {
        throw new Error('callable handler not set for test');
      }
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
    globalThis as { __pseudonymsMock?: { handler: CallableHandler } }
  ).__pseudonymsMock = { handler };
};

import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';

beforeEach(() => {
  loggedErrors.length = 0;
  // Reset module-level cache by rotating teacher uid — the hook clears
  // its cache whenever the cacheOwnerUid changes. We use the same uid
  // here but force-clear via importing a fresh module-load between tests
  // would be heavier; instead each test uses a distinct assignmentId.
});

afterEach(() => {
  vi.restoreAllMocks();
});

let uniqueAssignmentId = 0;
const nextAssignmentId = () => `assignment-${++uniqueAssignmentId}`;

function studentEntry(
  uid: string,
  pseudonym: string,
  given: string,
  family: string
) {
  return {
    studentUid: uid,
    assignmentPseudonym: pseudonym,
    givenName: given,
    familyName: family,
  };
}

describe('useAssignmentPseudonymsMulti', () => {
  it('merges resolved names from every class on the happy path', async () => {
    const handler: CallableHandler = ({ classId }) => {
      const pseudonyms: Record<string, PseudonymEntry> =
        classId === 'class-a'
          ? { p1: studentEntry('uid-1', 'pseudo-1', 'Alex', 'Lee') }
          : { p2: studentEntry('uid-2', 'pseudo-2', 'Pat', 'Smith') };
      return { data: { pseudonyms } };
    };
    setHandler(handler);

    const aid = nextAssignmentId();
    const { result } = renderHook(() =>
      useAssignmentPseudonymsMulti(aid, ['class-a', 'class-b'], 'org-1')
    );

    await waitFor(() => {
      expect(result.current.byStudentUid.size).toBe(2);
    });
    expect(result.current.byStudentUid.get('uid-1')?.givenName).toBe('Alex');
    expect(result.current.byStudentUid.get('uid-2')?.givenName).toBe('Pat');
    expect(loggedErrors).toHaveLength(0);
  });

  it('keeps surviving classes when one classId throws — partial resolution', async () => {
    setHandler(({ classId }) => {
      if (classId === 'class-bad') {
        return Promise.reject(
          new Error('Drive 403 on revoked share for class-bad')
        );
      }
      return Promise.resolve({
        data: {
          pseudonyms: {
            p1: studentEntry('uid-good', 'pseudo-good', 'Casey', 'Jones'),
          },
        },
      });
    });

    const aid = nextAssignmentId();
    const { result } = renderHook(() =>
      useAssignmentPseudonymsMulti(aid, ['class-good', 'class-bad'], 'org-1')
    );

    await waitFor(() => {
      expect(result.current.byStudentUid.has('uid-good')).toBe(true);
    });
    // The surviving class's entries must be present.
    expect(result.current.byStudentUid.get('uid-good')?.givenName).toBe(
      'Casey'
    );
    // The failing class must have produced exactly one log.
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0].scope).toBe(
      'useAssignmentPseudonymsMulti.fetchPerClass'
    );
    expect(loggedErrors[0].ctx).toMatchObject({ classId: 'class-bad' });
  });

  it('logs once per failing classId when multiple classes reject', async () => {
    setHandler(({ classId }) => {
      return Promise.reject(new Error(`fail ${classId}`));
    });

    const aid = nextAssignmentId();
    const { result } = renderHook(() =>
      useAssignmentPseudonymsMulti(
        aid,
        ['class-a', 'class-b', 'class-c'],
        'org-1'
      )
    );

    await waitFor(() => {
      expect(loggedErrors.length).toBe(3);
    });
    const loggedClassIds = loggedErrors.map(
      (e) => (e.ctx as { classId: string }).classId
    );
    expect(loggedClassIds.sort()).toEqual(['class-a', 'class-b', 'class-c']);
    // Empty merged map — viewers fall back to PIN/'Student' uniformly.
    expect(result.current.byStudentUid.size).toBe(0);
  });

  it('returns EMPTY_MAPS when assignmentId or classIds are absent (no callable invoked)', async () => {
    let calls = 0;
    setHandler(() => {
      calls++;
      return { data: { pseudonyms: {} } };
    });

    interface Props {
      aid: string | null;
      cids: readonly string[] | null;
    }
    const initialProps: Props = { aid: null, cids: ['class-a'] };
    const { result, rerender } = renderHook(
      ({ aid, cids }: Props) =>
        useAssignmentPseudonymsMulti(aid, cids, 'org-1'),
      { initialProps }
    );
    expect(result.current.byStudentUid.size).toBe(0);
    expect(calls).toBe(0);

    rerender({ aid: 'assignment-x', cids: [] } as Props);
    expect(result.current.byStudentUid.size).toBe(0);
    expect(calls).toBe(0);
  });
});
