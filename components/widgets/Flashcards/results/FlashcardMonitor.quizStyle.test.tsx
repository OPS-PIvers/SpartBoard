// flashcards-assign-v2: the monitor uses the Quiz monitor's student list, row menu, footer and card results.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FlashcardAssignment, FlashcardSession } from '@/types';
import {
  checkCardsDone,
  type FlashcardResultRecord,
} from '@/utils/flashcardResults';
import type { MonitorRosterPrefs } from '@/components/widgets/QuizWidget/components/monitor/rosterStyles';
import { FlashcardMonitor } from './FlashcardMonitor';

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
    status: 'active',
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
  status: 'active',
  createdAt: 0,
  updatedAt: 0,
} as FlashcardAssignment;

const NOW = 10 * 60_000;
const names: Record<string, string> = {
  ana: 'Ana Zed',
  ben: 'Ben Young',
  cy: 'Cy Xu',
};

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
      { cardId: 'c1', response: 'One ', correct: true },
      { cardId: 'c2', response: 'too', correct: false },
    ],
    flags: [{ cardId: 'c2', response: 'too' }],
  },
  {
    studentUid: 'cy',
    studyMs: 5000,
    lastActiveAt: NOW - 5 * 60_000,
    checkLog: { c1: { response: 'won', done: true } },
  },
];

const show = (
  over: {
    session?: FlashcardSession;
    prefs?: MonitorRosterPrefs;
    onUpdatePrefs?: (u: Partial<MonitorRosterPrefs>) => void;
    onResetStudent?: (uid: string) => void;
    strict?: boolean;
    results?: FlashcardResultRecord[];
    unlockAttemptFor?: (uid: string) => (() => void) | undefined;
    onClearHand?: (uid: string) => void;
  } = {}
) =>
  render(
    <FlashcardMonitor
      assignment={assignment}
      session={over.session ?? session()}
      results={over.results ?? results}
      tests={{}}
      unlockAttemptFor={over.unlockAttemptFor}
      onClearHand={over.onClearHand}
      nameFor={(uid) => names[uid] ?? uid}
      now={NOW}
      speakLanguage={null}
      published={false}
      onBack={vi.fn()}
      onResetStudent={over.onResetStudent ?? vi.fn()}
      onResolveFlag={vi.fn(() => Promise.resolve())}
      letInFor={() => undefined}
      onPublish={vi.fn()}
      onEnd={vi.fn(() => Promise.resolve())}
      classControls={null}
      launchedBy={null}
      quizStyle
      prefs={over.prefs ?? {}}
      onUpdatePrefs={over.onUpdatePrefs ?? vi.fn()}
    />,
    over.strict ? { wrapper: React.StrictMode } : undefined
  );

const bucket = (label: string) =>
  screen
    .getByText(label, { selector: 'span' })
    .closest('button') as HTMLElement;

describe('FlashcardMonitor quiz style', () => {
  it('labels the third count Done and counts idle students', () => {
    show();
    expect(bucket('Done')).toHaveTextContent('2');
    expect(screen.queryByText('Submitted')).not.toBeInTheDocument();
    expect(bucket('In progress')).toHaveTextContent('1 idle');
  });

  it('lists names only, with scores when Scores is on, and keeps flagged answers', () => {
    const { unmount } = show();
    fireEvent.click(bucket('Done'));
    expect(screen.getByText('Ana Zed')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
    expect(screen.queryByText(/submitted/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    unmount();

    show({ prefs: { monitorShowScores: true, monitorSortBy: 'score' } });
    fireEvent.click(bucket('Done'));
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    const names = screen
      .getAllByText(/^(Ana Zed|Ben Young)$/)
      .map((n) => n.textContent);
    expect(names).toEqual(['Ana Zed', 'Ben Young']);
  });

  it('saves toolbar choices and filters by score', () => {
    const onUpdatePrefs = vi.fn();
    show({ prefs: { monitorFilterBy: 'low' }, onUpdatePrefs });
    fireEvent.click(bucket('Done'));
    expect(screen.queryByText('Ana Zed')).not.toBeInTheDocument();
    expect(screen.getByText('Ben Young')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Scores' }));
    expect(onUpdatePrefs).toHaveBeenCalledWith({ monitorShowScores: true });
    expect(
      screen.queryByRole('button', { name: 'Tab warnings' })
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Filter students')).queryByText(
        'Left quiz tab'
      )
    ).not.toBeInTheDocument();
  });

  it('removes a student after confirming in the menu', () => {
    const onResetStudent = vi.fn();
    show({ onResetStudent });
    fireEvent.click(bucket('In progress'));
    expect(screen.getByText('Q2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Cy Xu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove student' }));
    expect(onResetStudent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));
    expect(onResetStudent).toHaveBeenCalledWith('cy');
    expect(
      screen.queryByRole('button', { name: 'Reset this student' })
    ).not.toBeInTheDocument();
  });

  it('counts and clears raised hands, and offers Unlock attempt', () => {
    const onClearHand = vi.fn();
    const unlock = vi.fn();
    show({
      session: session({
        rules: { attemptLimit: 1, sessionOptions: { handRaiseEnabled: true } },
      }),
      results: results.map((r) =>
        r.studentUid === 'cy' ? { ...r, handRaisedAt: NOW - 1000 } : r
      ),
      onClearHand,
      unlockAttemptFor: (uid) => (uid === 'ben' ? unlock : undefined),
    });
    expect(bucket('In progress')).toHaveTextContent('1 hand');
    fireEvent.click(bucket('In progress'));
    expect(screen.getByLabelText('Raised hand')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClearHand).toHaveBeenCalledWith('cy');

    fireEvent.click(bucket('Done'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Actions for Ben Young' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Unlock attempt' }));
    expect(unlock).toHaveBeenCalled();
  });

  it('drops Publish scores from the footer', () => {
    show();
    expect(
      screen.queryByRole('button', { name: /Publish scores/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Close all/ })
    ).toBeInTheDocument();
  });

  it('lists cards in order and opens what students answered', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: /Card results/ }));
    const rows = screen.getAllByText(/^Card \d$/).map((n) => n.textContent);
    expect(rows).toEqual(['Card 1', 'Card 2']);
    expect(screen.getByText('3 answered')).toBeInTheDocument();
    fireEvent.click(screen.getByText('uno'));
    expect(screen.getByText('Card 1 results')).toBeInTheDocument();
    expect(screen.getByText('Card 1 · 3 answered')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Correct answers appear in results after the session ends.'
      )
    ).toBeInTheDocument();
    const counts = screen
      .getAllByTestId('answer-distribution-row')
      .map((row) => row.textContent);
    expect(counts).toEqual(['one2', 'won1']);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Card results')).toBeInTheDocument();
  });

  it('numbers flagged-answer anchors the same under StrictMode', () => {
    show({ strict: true });
    fireEvent.click(bucket('Done'));
    const accept = screen.getByRole('button', { name: 'Accept' });
    expect(accept).toHaveAttribute('data-tour-field', 'row-1');
  });

  it('marks correct answers once the assignment ends', () => {
    show({ session: session({ status: 'ended' }) });
    fireEvent.click(screen.getByRole('button', { name: /Card results/ }));
    expect(screen.getAllByText('2 answered')).toHaveLength(2);
    fireEvent.click(screen.getByText('dos'));
    expect(screen.getByLabelText('Correct answer')).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Correct answers appear in results after the session ends.'
      )
    ).not.toBeInTheDocument();
  });

  it('puts students with flagged answers first under the name sort', () => {
    show();
    fireEvent.click(bucket('Done'));
    const order = screen
      .getAllByText(/^(Ana Zed|Ben Young)$/)
      .map((n) => n.textContent);
    expect(order).toEqual(['Ben Young', 'Ana Zed']);
  });

  it('keeps per-card pass rates for Speak checks', () => {
    show({ session: session({ checkMode: 'speak' }) });
    fireEvent.click(screen.getByRole('button', { name: /Card results/ }));
    expect(screen.queryByText('Card 1')).not.toBeInTheDocument();
    expect(screen.getByText(/2 of 2 correct/)).toBeInTheDocument();
  });
});

describe('checkCardsDone', () => {
  it('counts Test answers that never set done', () => {
    expect(
      checkCardsDone({
        studentUid: 'x',
        checkLog: {
          c1: { response: 'one', attempts: 0, done: false },
          c2: { response: '', attempts: 0, done: false },
        },
      })
    ).toBe(1);
  });
});
