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
import { readFileSync } from 'fs';
import { resolve } from 'path';
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
// Firestore subscriptions. `mockResponses` is mutable per-test so the
// scaling test below can exercise the summary-cards/per-question/
// student-list branches, not just the empty state.
interface GuidedLearningResponseFixture {
  sessionId: string;
  studentAnonymousId: string;
  pin?: string;
  answers: { stepId: string; answer: string | string[]; isCorrect: null }[];
  completedAt: number | null;
  startedAt: number;
  score: number | null;
}
let mockResponses: GuidedLearningResponseFixture[] = [];
vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({
    responses: mockResponses,
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

function makeSet(steps: GuidedLearningSet['steps'] = []): GuidedLearningSet {
  return {
    id: 'set-1',
    title: 'A Set',
    steps,
    createdAt: 0,
    updatedAt: 0,
  } as unknown as GuidedLearningSet;
}

beforeEach(() => {
  loggedErrors.length = 0;
  addToast.mockClear();
  pseudonymsHook.mockClear();
  mockResponses = [];
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

describe('GuidedLearningResults front-face scaling', () => {
  it('renders without the hardcoded-size classes the cqmin conversion removed', async () => {
    // jsdom's CSS parser doesn't recognize the `min()` function used by
    // every cqmin style here — React never even writes it to the style
    // attribute in this environment, so it can't be asserted on the
    // rendered DOM. Guard the regression the conversion actually fixes
    // instead: none of the removed fixed-size Tailwind classes come back.
    // Non-empty responses + a question step so the summary cards,
    // per-question breakdown, and student list all render too, not just
    // the header and empty state.
    getDocResult = { resolves: { exists: true, data: {} } };
    mockResponses = [
      {
        sessionId: 's1',
        studentAnonymousId: 'student-1',
        answers: [{ stepId: 'q1', answer: 'a', isCorrect: null }],
        completedAt: 100,
        startedAt: 0,
        score: null,
      },
      {
        sessionId: 's1',
        studentAnonymousId: 'student-2',
        answers: [],
        completedAt: null,
        startedAt: 0,
        score: null,
      },
    ];
    const set = makeSet([
      {
        id: 'q1',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        interactionType: 'question',
        question: { type: 'multiple-choice', text: 'What is 2+2?' },
      } as unknown as GuidedLearningSet['steps'][number],
    ]);
    const { container } = render(
      <GuidedLearningResults
        set={set}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    await waitFor(() => {
      expect(pseudonymsHook).toHaveBeenCalled();
    });
    // Sanity-check the non-empty branches actually rendered, so this test
    // can't silently degrade back to only covering the empty state.
    expect(container.querySelector('.font-bold.text-white')).not.toBeNull();
    expect(container.textContent?.includes('What is 2+2?')).toBe(true);

    const classNames = Array.from(container.querySelectorAll('*'))
      .map((el) => el.getAttribute('class') ?? '')
      .join(' ');
    for (const cls of [
      'text-xs',
      'text-sm',
      'text-2xl',
      'w-3',
      'w-4',
      'w-6',
      'h-3',
      'h-4',
      'h-6',
    ]) {
      expect(classNames.split(/\s+/)).not.toContain(cls);
    }
  });

  it('sizes text and icons with cqmin source, never cqh/cqw', () => {
    const source = readFileSync(
      resolve(
        __dirname,
        '../../../components/widgets/GuidedLearning/components/GuidedLearningResults.tsx'
      ),
      'utf8'
    );
    const cqminMatches = source.match(/cqmin/g) ?? [];
    expect(cqminMatches.length).toBeGreaterThan(20);
    expect(source).not.toMatch(/\bcqh\b/);
    expect(source).not.toMatch(/\bcqw\b/);
  });
});
