/**
 * Tests for the M17 D2 ref-scoped branch of `useAssignmentPseudonymsMulti`.
 *
 * A `targetMode:'students'` assignment spans a partial roster, so the callable
 * must be asked for exactly those refs. The contract pinned here: refs replace
 * the per-classId fan-out (one call, no classId), the legacy classId path is
 * byte-for-byte unchanged when no refs are passed, and a rejected ref call
 * still lands as empty maps rather than a stuck previous result.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { StudentTargetRef } from '@/types';

const loggedErrors: { scope: string; error: unknown; ctx?: unknown }[] = [];
vi.mock('@/utils/logError', () => ({
  logError: (scope: string, error: unknown, ctx?: unknown) => {
    loggedErrors.push({ scope, error, ctx });
  },
}));

interface CallableInput {
  assignmentId: string;
  classId?: string;
  orgId?: string;
  targetStudents?: readonly StudentTargetRef[];
}
interface PseudonymEntry {
  studentUid: string;
  assignmentPseudonym: string;
  givenName: string;
  familyName: string;
  targetRefKey?: string;
}
interface CallableResult {
  pseudonyms: Record<string, PseudonymEntry>;
}
type CallableHandler = (
  input: CallableInput
) => Promise<{ data: CallableResult }> | { data: CallableResult };

const calls: CallableInput[] = [];

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, _name: string) => {
    return (data: CallableInput) => {
      calls.push(data);
      const state = (
        globalThis as { __refPseudonymsMock?: { handler: CallableHandler } }
      ).__refPseudonymsMock;
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
    globalThis as { __refPseudonymsMock?: { handler: CallableHandler } }
  ).__refPseudonymsMock = { handler };
};

import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';

let uniqueAssignmentId = 0;
const nextAssignmentId = () => `ref-assignment-${++uniqueAssignmentId}`;

function entry(uid: string, given: string, refKey: string): PseudonymEntry {
  return {
    studentUid: uid,
    assignmentPseudonym: `pseudo-${uid}`,
    givenName: given,
    familyName: 'Doe',
    targetRefKey: refKey,
  };
}

beforeEach(() => {
  loggedErrors.length = 0;
  calls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useAssignmentPseudonymsMulti — target refs', () => {
  it('sends the refs in one call and omits classId', async () => {
    setHandler(({ targetStudents }) => ({
      data: {
        pseudonyms: Object.fromEntries(
          (targetStudents ?? []).map((ref) => [
            ref.kind === 'classlink' ? ref.sourcedId : ref.email,
            entry(
              `uid-${ref.kind === 'classlink' ? ref.sourcedId : ref.email}`,
              'Alex',
              ref.kind === 'classlink'
                ? `classlink:${ref.sourcedId}`
                : `test:${ref.email}`
            ),
          ])
        ),
      },
    }));

    const refs: StudentTargetRef[] = [
      { kind: 'classlink', sourcedId: 'SID-B' },
    ];
    const aid = nextAssignmentId();
    const { result } = renderHook(() =>
      useAssignmentPseudonymsMulti(aid, ['class-a', 'class-b'], 'org-1', refs)
    );

    await waitFor(() => {
      expect(result.current.byStudentUid.size).toBe(1);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].classId).toBeUndefined();
    expect(calls[0].targetStudents).toEqual(refs);
    expect(result.current.byStudentUid.get('uid-SID-B')?.givenName).toBe(
      'Alex'
    );
    expect(result.current.targetRefKeyByStudentUid.get('uid-SID-B')).toBe(
      'classlink:SID-B'
    );
  });

  it('falls back to the per-classId path when no refs are passed', async () => {
    setHandler(({ classId }) => ({
      data: {
        pseudonyms: {
          p: entry(`uid-${classId ?? ''}`, 'Pat', `classlink:${classId ?? ''}`),
        },
      },
    }));

    const aid = nextAssignmentId();
    const { result } = renderHook(() =>
      useAssignmentPseudonymsMulti(aid, ['class-a', 'class-b'], 'org-1')
    );

    await waitFor(() => {
      expect(result.current.byStudentUid.size).toBe(2);
    });
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.targetStudents === undefined)).toBe(true);
    expect(calls.map((c) => c.classId).sort()).toEqual(['class-a', 'class-b']);
  });

  it('resolves refs even when the assignment carries no classIds', async () => {
    setHandler(() => ({
      data: { pseudonyms: { s: entry('uid-only', 'Sam', 'classlink:SID-A') } },
    }));

    const aid = nextAssignmentId();
    const { result } = renderHook(() =>
      useAssignmentPseudonymsMulti(aid, [], '', [
        { kind: 'classlink', sourcedId: 'SID-A' },
      ])
    );

    await waitFor(() => {
      expect(result.current.byStudentUid.get('uid-only')?.givenName).toBe(
        'Sam'
      );
    });
  });

  it('reports a failing ref call and leaves the maps empty', async () => {
    setHandler(() => Promise.reject(new Error('permission-denied')));

    const aid = nextAssignmentId();
    const { result } = renderHook(() =>
      useAssignmentPseudonymsMulti(aid, ['class-a'], '', [
        { kind: 'classlink', sourcedId: 'SID-Z' },
      ])
    );

    await waitFor(() => {
      expect(loggedErrors).toHaveLength(1);
    });
    expect(result.current.byStudentUid.size).toBe(0);
  });
});
