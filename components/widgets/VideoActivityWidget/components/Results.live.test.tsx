import '@testing-library/jest-dom';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  ClassRoster,
  VideoActivityQuestion,
  VideoActivityResponse,
  VideoActivitySession,
} from '@/types';
import { initialVideoActivityLiveState } from '@/utils/videoActivityLive';

let features: Record<string, boolean> = {};
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    ensureGoogleScope: vi.fn(),
    user: { uid: 'teacher-1' },
    orgId: null,
    canAccessFeature: (id: string) => features[id] === true,
    isExternalUser: false,
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
const roster = {
  id: 'r1',
  name: 'Period 1',
  students: [
    { id: 'a', firstName: 'Ada', lastName: 'L', pin: '01', classLinkSourcedId: 'sid-a' },
    { id: 'b', firstName: 'Bo', lastName: 'D', pin: '02', classLinkSourcedId: 'sid-b' },
  ],
} as unknown as ClassRoster;
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn(), rosters: [roster] }),
}));
vi.mock('@/hooks/useAssignmentPseudonyms', () => ({
  useAssignmentPseudonymsMulti: () => ({
    byStudentUid: new Map(),
    targetRefKeyByStudentUid: new Map([['u-a', 'classlink:sid-a']]),
  }),
  formatStudentName: () => '',
}));
vi.mock('@/hooks/useLtiSessionNames', () => ({
  useLtiSessionNames: () => new Map(),
}));
const q = (id: string, timestamp: number): VideoActivityQuestion => ({
  id,
  timestamp,
  text: `Question ${id}`,
  type: 'MC',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  timeLimit: 0,
  points: 1,
});
const QUESTIONS = [q('q1', 10), q('q2', 20), q('q3', 30)];
vi.mock('@/hooks/useVideoActivityKeyQuestions', () => ({
  useVideoActivityKeyQuestions: () => ({
    questions: QUESTIONS,
    loading: false,
  }),
}));

import { Results } from './Results';

const session = (
  over: Partial<VideoActivitySession> = {}
): VideoActivitySession =>
  ({
    id: 's1',
    activityId: 'va-1',
    activityTitle: 'Photosynthesis',
    assignmentName: 'Period 1',
    teacherUid: 'teacher-1',
    youtubeUrl: 'https://youtu.be/abc',
    questions: [],
    status: 'ended',
    allowedPins: [],
    createdAt: 1,
    rosterIds: ['r1'],
    sessionMode: 'teacher',
    live: {
      ...initialVideoActivityLiveState(0),
      askedQuestionIds: ['q1', 'q3'],
      skippedQuestionIds: ['q2'],
    },
    ...over,
  }) as VideoActivitySession;

const response: VideoActivityResponse = {
  studentUid: 'u-a',
  name: 'Ada L',
  joinedAt: 1,
  answers: [{ questionId: 'q1', answer: 'A', answeredAt: 2 }],
  completedAt: 3,
  score: null,
};

beforeEach(() => {
  features = { 'video-activity-live': true };
});

describe('Video activity Results: live sessions', () => {
  it('shows skipped questions as not asked on the Questions tab', () => {
    render(
      <Results session={session()} responses={[response]} onBack={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('tab', { name: /Questions/ }));
    expect(screen.getAllByText('Not asked')).toHaveLength(1);
    // q1 all correct, q3 answered by nobody.
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('marks each question correct, missed or not asked for a student', () => {
    render(
      <Results session={session()} responses={[response]} onBack={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('tab', { name: /Students/ }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('img', { name: 'Correct' })).toBeTruthy();
    expect(within(panel).getByRole('img', { name: 'Not asked' })).toBeTruthy();
    expect(within(panel).getByRole('img', { name: 'Missed' })).toBeTruthy();
    // Scored over the two asked questions.
    expect(within(panel).getByText('1/2 correct')).toBeInTheDocument();
  });

  it('offers a make-up aimed at students with no answers', () => {
    const onAssignMakeUp = vi.fn();
    render(
      <Results
        session={session()}
        responses={[response]}
        onBack={vi.fn()}
        onAssignMakeUp={onAssignMakeUp}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Assign make-up \(self-paced\)/ })
    );
    expect(onAssignMakeUp).toHaveBeenCalledWith([
      { kind: 'classlink', sourcedId: 'sid-b' },
    ]);
  });

  it('hides the make-up while the session runs, without the flag, or when self-paced', () => {
    const { rerender } = render(
      <Results
        session={session({ status: 'active' })}
        responses={[]}
        onBack={vi.fn()}
        onAssignMakeUp={vi.fn()}
      />
    );
    const button = () =>
      screen.queryByRole('button', { name: /Assign make-up/ });
    expect(button()).toBeNull();
    rerender(
      <Results
        session={session({ sessionMode: undefined, live: undefined })}
        responses={[]}
        onBack={vi.fn()}
        onAssignMakeUp={vi.fn()}
      />
    );
    expect(button()).toBeNull();
    features = {};
    rerender(
      <Results
        session={session()}
        responses={[]}
        onBack={vi.fn()}
        onAssignMakeUp={vi.fn()}
      />
    );
    expect(button()).toBeNull();
  });

  it('keeps the self-paced strip to answered questions only', () => {
    render(
      <Results
        session={session({ sessionMode: undefined, live: undefined })}
        responses={[response]}
        onBack={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: /Students/ }));
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).queryByRole('img', { name: 'Missed' })).toBeNull();
    expect(within(panel).getByText('1/3 correct')).toBeInTheDocument();
  });
});
