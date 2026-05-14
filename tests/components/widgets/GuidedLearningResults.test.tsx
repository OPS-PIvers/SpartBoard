/* eslint-disable @typescript-eslint/require-await -- mocked getDoc matches
   the production Promise-returning contract; no await needed inside. */
/**
 * Tests for GuidedLearningResults — fetchSessionClassIds error/legacy paths.
 *
 * Covers the previously-untested classIds discovery side-effect:
 *  - getDoc rejects → toast surfaces + logError fires (no silent degradation)
 *  - data has classIds[] → state captures the array
 *  - data has legacy classId only → state captures [classId]
 *  - data has neither → state stays empty (no false-positive log)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';

const loggedErrors: { scope: string; error: unknown }[] = [];
vi.mock('@/utils/logError', () => ({
  logError: (scope: string, error: unknown) => {
    loggedErrors.push({ scope, error });
  },
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ orgId: 'org-1' }),
}));

// Stub the heavy hook surfaces so the component renders without touching
// Firestore subscriptions.
vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({
    responses: [],
    responsesLoading: false,
    subscribeToResponses: () => () => undefined,
    exportResponsesAsCSV: vi.fn(),
  }),
  isAnswerCorrect: () => false,
}));

type PseudonymsCallArgs = [
  string | null | undefined,
  readonly string[] | null | undefined,
  string | null | undefined,
];
const pseudonymsHook = vi.fn((..._args: PseudonymsCallArgs) => ({
  byStudentUid: new Map<string, { givenName: string; familyName: string }>(),
  byAssignmentPseudonym: new Map<
    string,
    { givenName: string; familyName: string }
  >(),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: (...args: PseudonymsCallArgs) =>
    pseudonymsHook(...args),
  formatStudentName: () => '',
}));

// Firestore getDoc mock controllable per test.
interface GetDocResult {
  rejects?: boolean;
  resolves?: { exists: boolean; data: unknown };
}
let getDocResult: GetDocResult = {
  resolves: { exists: true, data: { classIds: [] } },
};
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDoc: async () => {
    if (getDocResult.rejects) {
      throw new Error('permission-denied: simulated regression');
    }
    const resolves = getDocResult.resolves ?? { exists: true, data: {} };
    return {
      exists: () => resolves.exists,
      data: () => resolves.data,
    };
  },
}));
vi.mock('@/config/firebase', () => ({
  db: {},
}));

import { GuidedLearningResults } from '@/components/widgets/GuidedLearning/components/GuidedLearningResults';

function makeSet(): GuidedLearningSet {
  return {
    id: 'set-1',
    title: 'A Set',
    steps: [],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as GuidedLearningSet;
}

beforeEach(() => {
  loggedErrors.length = 0;
  addToast.mockClear();
  pseudonymsHook.mockClear();
});

describe('GuidedLearningResults.fetchSessionClassIds', () => {
  it('logs AND surfaces a toast when getDoc rejects (silent-failure surfacing)', async () => {
    getDocResult = { rejects: true };
    render(
      <GuidedLearningResults
        set={makeSet()}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    await waitFor(() => {
      expect(loggedErrors).toHaveLength(1);
    });
    expect(loggedErrors[0].scope).toBe(
      'GuidedLearningResults.fetchSessionClassIds'
    );
    expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/anonymous/i),
      'error'
    );
  });

  it('captures classIds from the session doc when present', async () => {
    getDocResult = {
      resolves: { exists: true, data: { classIds: ['class-a', 'class-b'] } },
    };
    render(
      <GuidedLearningResults
        set={makeSet()}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    await waitFor(() => {
      const lastCall = pseudonymsHook.mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual(['class-a', 'class-b']);
    });
    expect(loggedErrors).toHaveLength(0);
    expect(addToast).not.toHaveBeenCalled();
  });

  it('falls back to legacy `classId` field when classIds is absent', async () => {
    getDocResult = {
      resolves: { exists: true, data: { classId: 'legacy-class' } },
    };
    render(
      <GuidedLearningResults
        set={makeSet()}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    await waitFor(() => {
      const lastCall = pseudonymsHook.mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual(['legacy-class']);
    });
    expect(loggedErrors).toHaveLength(0);
  });

  it('leaves state empty when the doc has no class fields (no false-positive log/toast)', async () => {
    getDocResult = { resolves: { exists: true, data: {} } };
    render(
      <GuidedLearningResults
        set={makeSet()}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    // Give the effect a tick to complete.
    await waitFor(() => {
      expect(pseudonymsHook).toHaveBeenCalled();
    });
    // No log, no toast on the "no class fields" case.
    expect(loggedErrors).toHaveLength(0);
    expect(addToast).not.toHaveBeenCalled();
  });
});
