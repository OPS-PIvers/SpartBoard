import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  GuidedLearningResponse,
  GuidedLearningSet,
  GuidedLearningStep,
} from '@/types';

const docs = new Map<string, Record<string, unknown>>();
let responses: GuidedLearningResponse[] = [];

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: (path: string) =>
    Promise.resolve({ data: () => docs.get(path) ?? undefined }),
  onSnapshot: () => () => undefined,
}));
vi.mock('@/hooks/useGuidedLearningSession', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/hooks/useGuidedLearningSession')>();
  return {
    ...actual,
    useGuidedLearningSessionTeacher: () => ({
      responses,
      responsesLoading: false,
      subscribeToResponses: () => () => undefined,
      exportResponsesAsCSV: () => '',
    }),
  };
});
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({ byStudentUid: new Map() }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0, loading: false }),
}));
vi.mock('@/context/useAuth', () => ({ useAuth: () => ({ orgId: null }) }));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn(), rosters: [] }),
}));

import { GuidedLearningResults } from './GuidedLearningResults';
import { toPublicStep } from '@/hooks/useGuidedLearningSession';

const mc = (id: string, correct: string): GuidedLearningStep => ({
  id,
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'question',
  question: {
    type: 'multiple-choice',
    text: `Question ${id}`,
    choices: ['a', 'b'],
    correctAnswer: correct,
  },
});
const makeSet = (steps: GuidedLearningStep[]) =>
  ({
    id: 'set1',
    title: 'Fractions',
    mode: 'structured',
    imageUrls: [],
    steps,
  }) as unknown as GuidedLearningSet;

const response = (
  id: string,
  answers: [string, string][],
  completedAt: number | null = 5
): GuidedLearningResponse =>
  ({
    sessionId: 's1',
    studentAnonymousId: id,
    pin: id,
    answers: answers.map(([stepId, answer]) => ({
      stepId,
      answer,
      isCorrect: null,
    })),
    startedAt: 1,
    completedAt,
    score: null,
  }) as GuidedLearningResponse;

const ASSIGNED = [mc('q1', 'a'), mc('q2', 'b'), mc('q3', 'a')];

beforeEach(() => {
  docs.clear();
  docs.set('guided_learning_sessions/s1', {
    publicSteps: ASSIGNED.map(toPublicStep),
  });
  responses = [
    response('11', [['q1', 'a']], null),
    response('22', [
      ['q1', 'a'],
      ['q2', 'b'],
      ['q3', 'b'],
    ]),
  ];
});

describe('GuidedLearningResults scoring', () => {
  it('divides by the number of questions, not the number answered', async () => {
    render(
      <GuidedLearningResults
        set={makeSet(ASSIGNED)}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    expect(await screen.findByText('1/3 correct')).toBeInTheDocument();
    expect(screen.getByText('2/3 correct')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('keeps scores unchanged after the set is edited post-assign', async () => {
    const edited = [mc('q4', 'a'), mc('q3', 'a'), mc('q1', 'a'), mc('q2', 'b')];
    render(
      <GuidedLearningResults
        set={makeSet(edited)}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    expect(await screen.findByText('1/3 correct')).toBeInTheDocument();
    expect(screen.getByText('2/3 correct')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.queryByText(/Question q4/)).not.toBeInTheDocument();
  });

  it('reads frozen steps from the content doc on a per-period session', async () => {
    docs.set('guided_learning_sessions/s1', {
      publicSteps: [],
      stepsInContent: true,
    });
    docs.set('guided_learning_sessions/s1/content/steps', {
      publicSteps: ASSIGNED.map(toPublicStep),
    });
    render(
      <GuidedLearningResults
        set={makeSet([...ASSIGNED, mc('q4', 'a')])}
        sessionId="s1"
        onClose={() => undefined}
      />
    );
    expect(await screen.findByText('2/3 correct')).toBeInTheDocument();
  });
});
