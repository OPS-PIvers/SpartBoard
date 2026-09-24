import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(true) }),
}));

import { FreeResponseGrader } from '@/components/widgets/QuizWidget/components/FreeResponseGrader';
import { AnnotatedResponseView } from '@/components/widgets/QuizWidget/components/AnnotatedResponseView';
import { AuthContext } from '@/context/AuthContextValue';
import type { AuthContextType } from '@/context/AuthContextValue';
import type {
  QuizData,
  QuizResponse,
  Rubric,
  WrittenAnswerAnnotation,
} from '@/types';

const quiz: QuizData = {
  id: 'quiz-1',
  title: 'Quiz',
  createdAt: 0,
  updatedAt: 0,
  questions: [
    {
      id: 'q1',
      type: 'free-response',
      text: 'Write something.',
      timeLimit: 0,
      correctAnswer: '',
      incorrectAnswers: [],
      points: 10,
    },
  ],
};

const responseFor = (uid: string, tabSwitchWarnings: number): QuizResponse => ({
  studentUid: uid,
  _responseKey: uid,
  pin: '1234',
  answers: [{ questionId: 'q1', answer: '<p>hello world</p>', answeredAt: 0 }],
  status: 'completed',
  joinedAt: 0,
  submittedAt: 0,
  score: 0,
  tabSwitchWarnings,
  completedAttempts: 1,
});

const renderGrader = (flagOn: boolean) =>
  render(
    <AuthContext.Provider
      value={{ canAccessFeature: () => flagOn } as unknown as AuthContextType}
    >
      <FreeResponseGrader
        quiz={quiz}
        responses={[responseFor('uid-a', 3), responseFor('uid-b', 0)]}
        displayNameByResponseKey={
          new Map([
            ['uid-a', 'Ada Lovelace'],
            ['uid-b', 'Grace Hopper'],
          ])
        }
        teacherUid="teacher-1"
        onSaveGrade={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    </AuthContext.Provider>
  );

beforeEach(() => window.localStorage.clear());

describe('FreeResponseGrader — quiz-grader-v2', () => {
  it('leaves the grader unchanged while the flag is off', () => {
    renderGrader(false);
    expect(
      screen.queryByRole('button', { name: /hide student list/i })
    ).toBeNull();
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(2);
  });

  it('shows the name once, in the list, with its tab switches', () => {
    renderGrader(true);
    const list = screen.getByRole('navigation');
    expect(screen.getAllByText('Ada Lovelace')).toHaveLength(1);
    expect(list.textContent).toContain('Ada Lovelace');
    expect(list.textContent).toMatch(/3 tab switches/i);
    expect(screen.getByText('hello world')).toBeTruthy();
    expect(screen.getByText(/2 words/)).toBeTruthy();
  });

  it('collapses the list to a count that hides names, and remembers it', () => {
    const { unmount } = renderGrader(true);
    expect(screen.getByText('0/2 graded')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /hide student list/i }));
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
    expect(screen.getByLabelText('0 of 2 graded')).toBeTruthy();
    unmount();
    renderGrader(true);
    expect(
      screen.getByRole('button', { name: /show student list/i })
    ).toBeTruthy();
  });
});

const oneStrand: Rubric = {
  id: 'r1',
  title: 'R',
  createdAt: 0,
  updatedAt: 0,
  criteria: [
    {
      id: 'c1',
      name: 'Ideas',
      levels: [{ id: 'l1', label: 'Good', points: 4 }],
    },
  ],
} as unknown as Rubric;

const twoStrands: Rubric = {
  ...oneStrand,
  criteria: [
    ...oneStrand.criteria,
    {
      id: 'c2',
      name: 'Voice',
      levels: [{ id: 'l2', label: 'Good', points: 4 }],
    },
  ],
} as unknown as Rubric;

const highlight = (rubric: Rubric): WrittenAnswerAnnotation => {
  const onChange = vi.fn<(next: WrittenAnswerAnnotation[]) => void>();
  const { container } = render(
    <AnnotatedResponseView
      mode="edit"
      snapshot="<p>The student wrote this essay.</p>"
      annotations={[]}
      authorUid="t1"
      onChange={onChange}
      activeId={null}
      onActiveIdChange={vi.fn()}
      rubric={rubric}
      autoTagSingleStrand
    />
  );
  const article = container.querySelector('article') as HTMLElement;
  const text = article.querySelector('p')?.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 11);
  range.getBoundingClientRect = () =>
    ({ left: 10, top: 10, bottom: 20, width: 40, height: 10 }) as DOMRect;
  const sel = window.getSelection() as Selection;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(article);
  fireEvent.click(screen.getByRole('button', { name: 'Green highlight' }));
  return onChange.mock.calls[0][0][0];
};

describe('one-strand rubrics tag evidence automatically', () => {
  it('tags a highlight to the only strand with no extra step', () => {
    expect(highlight(oneStrand).rubricCriteria).toEqual([
      { criterionId: 'c1', name: 'Ideas' },
    ]);
  });

  it('keeps the picker, and no automatic tag, with two strands', () => {
    expect(highlight(twoStrands).rubricCriteria).toBeUndefined();
  });
});
