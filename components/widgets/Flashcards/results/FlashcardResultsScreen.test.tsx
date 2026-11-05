// flashcards-assign-v2: a Check's Results screen built on Quiz's results pieces.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlashcardAssignment, FlashcardSession } from '@/types';
import type { FlashcardResultRecord } from '@/utils/flashcardResults';
import {
  flashcardGradeFn,
  flashcardQuizQuestions,
  flashcardQuizResponse,
} from '@/utils/flashcardQuizShape';

const drive = vi.hoisted(() => ({
  exportResultsToSheet: vi.fn(() =>
    Promise.resolve('https://docs.google.com/spreadsheets/d/x/edit')
  ),
}));
const printProps = vi.hoisted(() => ({
  last: null as null | Record<string, unknown>,
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    ensureGoogleScope: () => Promise.resolve('token'),
    canAccessFeature: () => false,
    isExternalUser: false,
    user: { uid: 'teacher-1' },
  }),
}));
vi.mock('@/hooks/useViewAsOutward', () => ({
  useViewAsOutward: () => ({
    active: false,
    locked: false,
    lockedTitle: undefined,
    confirm: () => Promise.resolve(true),
  }),
  VIEW_AS_WRITES: { exportSheets: [] },
}));
vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: class {
    exportResultsToSheet = drive.exportResultsToSheet;
  },
}));
vi.mock('@/components/widgets/QuizWidget/components/ResultsPrintModal', () => ({
  ResultsPrintModal: (props: Record<string, unknown>) => {
    printProps.last = props;
    return <div>Print dialog</div>;
  },
}));

import { FlashcardResultsScreen } from './FlashcardResultsScreen';

const cards = [
  { id: 'c1', term: 'uno', definition: 'one' },
  { id: 'c2', term: 'dos', definition: 'two' },
];

const session = (over: Partial<FlashcardSession> = {}): FlashcardSession =>
  ({
    id: 'fc-1',
    title: 'Spanish',
    kind: 'check',
    checkMode: 'write',
    status: 'ended',
    teacherUid: 'teacher-1',
    termLanguage: 'es-ES',
    definitionLanguage: 'en-US',
    classIds: ['cl-1'],
    cards,
    ...over,
  }) as FlashcardSession;

const assignment = {
  id: 'fc-1',
  sessionId: 'fc-1',
  setId: 'set-1',
  setTitle: 'Spanish',
  teacherUid: 'teacher-1',
  kind: 'check',
  status: 'ended',
  createdAt: 0,
  updatedAt: 0,
} as FlashcardAssignment;

const names: Record<string, [string, string]> = {
  ana: ['Ana', 'Zed'],
  ben: ['Ben', 'Young'],
  cy: ['Cy', 'Xu'],
};
const nameFor = (uid: string) => names[uid]?.join(' ') ?? uid;
const sortNameFor = (uid: string) =>
  names[uid] ? `${names[uid][1]} ${names[uid][0]}` : uid;

const results: FlashcardResultRecord[] = [
  {
    studentUid: 'ana',
    submittedAt: 1,
    score: 2,
    total: 2,
    answerLog: [
      { cardId: 'c1', response: 'one', correct: true },
      { cardId: 'c2', response: 'two', correct: true },
    ],
  },
  {
    studentUid: 'ben',
    submittedAt: 2,
    score: 1,
    total: 2,
    answerLog: [
      { cardId: 'c1', response: 'one', correct: true },
      { cardId: 'c2', response: 'too', correct: false },
    ],
  },
  {
    studentUid: 'cy',
    studyMs: 5000,
    checkLog: { c1: { response: 'won', done: true } },
  },
];

const actions = {
  publish: vi.fn(() => Promise.resolve({ responsesUpdated: 1, skipped: 0 })),
  hide: vi.fn(() => Promise.resolve()),
  clear: vi.fn(() => Promise.resolve()),
};

const show = (
  over: {
    session?: FlashcardSession;
    results?: FlashcardResultRecord[];
    withActions?: boolean;
  } = {}
) =>
  render(
    <FlashcardResultsScreen
      assignment={assignment}
      session={over.session ?? session()}
      results={over.results ?? results}
      nameFor={nameFor}
      sortNameFor={sortNameFor}
      classLabelFor={(id) => id}
      exportNames={new Map()}
      speakLanguage={null}
      onBack={vi.fn()}
      classControls={null}
      launchedBy={null}
      addToast={vi.fn()}
      studentResultsActions={over.withActions ? actions : undefined}
      classVisibility="none"
    />
  );

const rowNames = () =>
  screen
    .getAllByText(/^(Ana Zed|Ben Young|Cy Xu|Student \d)$/)
    .map((n) => n.textContent);

describe('FlashcardResultsScreen', () => {
  beforeEach(() => {
    drive.exportResultsToSheet.mockClear();
    printProps.last = null;
  });

  it('shows the class average, finished count and score distribution', () => {
    show();
    expect(screen.getByText('Class average')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 students finished')).toBeInTheDocument();
    expect(screen.getByText('Score distribution')).toBeInTheDocument();
    expect(screen.getByText('2 cards')).toBeInTheDocument();
    expect(screen.getByText('3 students')).toBeInTheDocument();
  });

  it('lists students by score or last name and opens their card answers', () => {
    show();
    fireEvent.click(screen.getByText('Students'));
    expect(rowNames()).toEqual(['Ana Zed', 'Ben Young', 'Cy Xu']);
    fireEvent.click(screen.getByRole('button', { name: 'Last name' }));
    expect(rowNames()).toEqual(['Cy Xu', 'Ben Young', 'Ana Zed']);
    expect(screen.getByText('in-progress')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ben Young/ }));
    expect(screen.getByText('too')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Print report' }));
    expect(printProps.last?.initialSelection).toEqual(['ben']);
  });

  it('hides names behind numbered labels, sorted by the label', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Hide student names' }));
    fireEvent.click(screen.getByText('Students'));
    expect(rowNames()).toEqual(['Student 1', 'Student 2', 'Student 3']);
    fireEvent.click(screen.getByRole('button', { name: 'Last name' }));
    expect(rowNames()).toEqual(['Student 1', 'Student 2', 'Student 3']);
  });

  it('prints everyone without the target, written and passage switches', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Print results' }));
    expect(printProps.last?.initialSelection).toBeNull();
    expect(printProps.last?.hiddenOptions).toEqual([
      'showTargets',
      'showWrittenFeedback',
      'includeStimuli',
    ]);
  });

  it('exports to a new sheet, then offers Open Sheet', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Export to Sheets/ }));
    await waitFor(() =>
      expect(screen.getByText('Open Sheet')).toBeInTheDocument()
    );
    const call = drive.exportResultsToSheet.mock.calls[0] as unknown as [
      string,
      { studentUid: string; status: string }[],
      unknown[],
      { gradeFn: unknown },
    ];
    expect(call[0]).toBe('Spanish');
    expect(call[1].map((r) => r.status)).toEqual([
      'completed',
      'completed',
      'in-progress',
    ]);
    expect(call[3].gradeFn).toBe(flashcardGradeFn);
  });

  it('opens card results with correct answers marked', () => {
    show();
    fireEvent.click(screen.getByText('Card results'));
    fireEvent.click(screen.getByText('dos'));
    expect(screen.getByText('Card 2 results')).toBeInTheDocument();
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
  });

  it('has no per-student controls without the actions', () => {
    show();
    fireEvent.click(screen.getByText('Students'));
    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
  });

  it('hides results from the picked students with the bulk bar', async () => {
    actions.hide.mockClear();
    show({ withActions: true });
    fireEvent.click(screen.getByText('Students'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ben Young' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Hide results/ }));
    await waitFor(() => expect(actions.hide).toHaveBeenCalledWith(['ben']));
  });

  it("shows one student's results from the open row with an end date", async () => {
    actions.publish.mockClear();
    show({ withActions: true });
    fireEvent.click(screen.getByText('Students'));
    fireEvent.click(screen.getByRole('button', { name: 'Ana Zed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show results' }));
    fireEvent.click(screen.getByLabelText('Score & Responses'));
    fireEvent.click(screen.getByText('1 week'));
    const confirm = screen
      .getAllByRole('button', { name: 'Show results' })
      .at(-1);
    fireEvent.click(confirm as HTMLElement);
    await waitFor(() => expect(actions.publish).toHaveBeenCalled());
    const [keys, level, expiresAt] = actions.publish.mock
      .calls[0] as unknown as [string[], string, number];
    expect(keys).toEqual(['ana']);
    expect(level).toBe('score-and-responses');
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('badges a student whose results are hidden', () => {
    show({
      withActions: true,
      results: [
        { ...results[0], resultsOverride: { mode: 'hidden', publishedAt: 1 } },
      ],
    });
    fireEvent.click(screen.getByText('Students'));
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('shows the empty state before anyone has progress', () => {
    show({ results: [] });
    expect(screen.getByText('No data available yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Export to Sheets/ })
    ).not.toBeInTheDocument();
  });
});

describe('flashcardQuizShape', () => {
  it('counts accepted typos right and serves only the cards answered', () => {
    const response = flashcardQuizResponse(
      {
        studentUid: 'x',
        submittedAt: 5,
        score: 1,
        total: 1,
        answerLog: [{ cardId: 'c2', response: 'tow', correct: false }],
        flags: [{ cardId: 'c2', response: 'tow', accepted: true }],
      },
      session()
    );
    expect(response.servedQuestionIds).toEqual(['c2']);
    expect(response.score).toBe(100);
    const [, q2] = flashcardQuizQuestions(session());
    expect(q2.correctAnswer).toBe('two');
    expect(flashcardGradeFn(q2, 'tow', response).isCorrect).toBe(true);
  });

  it('keeps unfinished work out of the graded answers', () => {
    const response = flashcardQuizResponse(results[2], session());
    expect(response.status).toBe('in-progress');
    expect(response.answers).toEqual([]);
    expect(response.score).toBeNull();
  });

  it('counts every card mastered on a mastery Check', () => {
    const mastery = session({ checkMode: 'flashcards' });
    const response = flashcardQuizResponse(
      { studentUid: 'x', submittedAt: 5, score: 2, total: 2, answerLog: [] },
      mastery
    );
    const questions = flashcardQuizQuestions(mastery);
    expect(questions.map((q) => q.correctAnswer)).toEqual(['', '']);
    expect(
      questions.map((q) => flashcardGradeFn(q, '', response).isCorrect)
    ).toEqual([true, true]);
  });

  it('shows the term said on a Speak Check, with no typed key', () => {
    const speak = session({ checkMode: 'speak' });
    const response = flashcardQuizResponse(
      {
        studentUid: 'x',
        submittedAt: 5,
        score: 0,
        total: 1,
        answerLog: [{ cardId: 'c1', response: '', correct: false }],
      },
      speak
    );
    expect(response.answers[0].answer).toBe('uno');
    expect(flashcardQuizQuestions(speak)[0].correctAnswer).toBe('');
  });

  it('keeps a multi-line card side as one answer', () => {
    const [q1] = flashcardQuizQuestions(
      session({
        cards: [{ id: 'c1', term: 'uno', definition: 'one\nthe number' }],
      })
    );
    expect(q1.correctAnswer).toBe('one the number');
  });
});
