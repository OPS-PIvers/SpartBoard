import '@testing-library/jest-dom';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { QuizConfig, QuizData, QuizSession } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: null,
    updateWidget: vi.fn(),
    addWidget: vi.fn(),
    addToast: vi.fn(),
    rosters: [],
  }),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    ensureGoogleScope: vi.fn(),
    user: { uid: 'teacher-1' },
    orgId: null,
    canAccessFeature: () => false,
    isExternalUser: false,
    googleAccessToken: null,
    refreshGoogleToken: vi.fn(),
    canAccessQuizMediaResponse: () => false,
    quizGraderMode: 'list',
    quizGraderAutoAdvance: false,
    updateAccountPreferences: vi.fn(),
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({
    plcs: [],
    clearPlcSharedSheetUrl: vi.fn(),
    setPlcSharedSheetUrl: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    loading: false,
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { QuizResults } from './QuizResults';

const quiz = { id: 'q1', title: 'Cells', questions: [] } as unknown as QuizData;
const config = {} as QuizConfig;

const session = (over: Partial<QuizSession> = {}): QuizSession =>
  ({
    id: 's1',
    assignmentId: 's1',
    quizId: 'q1',
    quizTitle: 'Cells',
    teacherUid: 'teacher-1',
    status: 'active',
    sessionMode: 'student',
    currentQuestionIndex: 0,
    startedAt: Date.UTC(2026, 8, 23, 14, 0, 0),
    endedAt: null,
    code: 'AB12CD',
    totalQuestions: 0,
    publicQuestions: [],
    ...over,
  }) as QuizSession;

const show = (over?: Partial<QuizSession>) =>
  render(
    <QuizResults
      quiz={quiz}
      responses={[]}
      config={config}
      onBack={vi.fn()}
      session={over === undefined ? session() : session(over)}
    />
  );

describe('QuizResults — who started the run', () => {
  // The stamp shows above the empty state too: a sub-launched quiz nobody
  // answered still has to say who started it.
  it('names the substitute who launched it', () => {
    show({
      launchedBy: {
        uid: 'sub-1',
        email: 'sub@orono.k12.mn.us',
        shareId: 'share-1',
      },
    });

    expect(screen.getByTestId('launched-by-sub')).toHaveTextContent(
      /Launched by sub@orono\.k12\.mn\.us/
    );
  });

  it('says nothing on a run the teacher started', () => {
    show();
    expect(screen.queryByTestId('launched-by-sub')).not.toBeInTheDocument();
  });
});
