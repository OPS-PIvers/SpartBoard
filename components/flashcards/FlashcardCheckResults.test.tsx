// flashcards-assign-v2 slice 5: the submitted screen honors Quiz's three levels and per-student settings.
import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  FlashcardProgress,
  FlashcardPublishedVisibility,
  FlashcardSession,
  QuizResultsOverride,
} from '@/types';
import { FlashcardCheckResults } from './FlashcardCheckResults';
import { flashcardClassVisibility } from '@/utils/flashcardResultsVisibility';

const session = (scoreVisibility?: FlashcardPublishedVisibility) =>
  ({
    id: 'fc-1',
    kind: 'check',
    checkMode: 'write',
    cards: [
      { id: 'c1', term: 'uno', definition: 'one' },
      { id: 'c2', term: 'dos', definition: 'two' },
    ],
    scoreVisibility,
    scorePublishedAt: scoreVisibility ? 1 : undefined,
  }) as FlashcardSession;

const RULES = {
  attemptLimit: 1,
  sessionOptions: {},
} as unknown as FlashcardSession['rules'];

const progress = (resultsOverride?: QuizResultsOverride) =>
  ({
    classId: 'cl-1',
    studyMs: 60000,
    round: 1,
    submittedAt: 5,
    score: 1,
    total: 2,
    answerLog: [
      { cardId: 'c1', response: 'one', correct: true },
      { cardId: 'c2', response: 'too', correct: false },
    ],
    resultsOverride,
  }) as unknown as FlashcardProgress;

const show = (
  visibility?: FlashcardPublishedVisibility,
  override?: QuizResultsOverride
) =>
  render(
    <FlashcardCheckResults
      session={session(visibility)}
      progress={progress(override)}
    />
  );

describe('FlashcardCheckResults', () => {
  it('maps the two older levels onto Quiz levels', () => {
    expect(flashcardClassVisibility('score')).toBe('score-only');
    expect(flashcardClassVisibility('score-and-answers')).toBe(
      'score-responses-and-answers'
    );
    expect(flashcardClassVisibility(undefined)).toBe('none');
  });

  it('keeps results hidden until they are shown', () => {
    show('none');
    expect(
      screen.getByText('Your teacher will share your results later.')
    ).toBeInTheDocument();
  });

  it('shows only the score on an older score-only Check', () => {
    show('score');
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.queryByText('Review missed cards')).not.toBeInTheDocument();
  });

  it('shows missed answers and the right answers on an older answers Check', () => {
    show('score-and-answers');
    expect(screen.getByText('too')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
  });

  it('shows the student their answers without the key at score and responses', () => {
    show('score-and-responses');
    expect(screen.getByText('too')).toBeInTheDocument();
    expect(screen.queryByText('Correct answer:')).not.toBeInTheDocument();
  });

  it("lets one student's setting win until it ends", () => {
    const { unmount } = show('score-responses-and-answers', {
      mode: 'hidden',
      publishedAt: 2,
    });
    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
    unmount();
    show('none', {
      mode: 'shown',
      visibility: 'score-only',
      publishedAt: 2,
      expiresAt: Date.now() + 60_000,
    });
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('shows how many cards were answered while results are hidden on a new Check', () => {
    render(
      <FlashcardCheckResults
        session={{ ...session('none'), rules: RULES }}
        progress={progress()}
      />
    );
    expect(screen.getByText('of 2 cards answered')).toBeInTheDocument();
    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
  });

  it('reviews every card, right and wrong, once responses are shown', () => {
    show('score-and-responses');
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 correct')).toBeInTheDocument();
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('too')).toBeInTheDocument();
    expect(screen.getByLabelText('Correct')).toBeInTheDocument();
    expect(screen.getByLabelText('Incorrect')).toBeInTheDocument();
  });

  it('watermarks protected results', () => {
    const { container } = render(
      <FlashcardCheckResults
        session={{
          ...session('score-only'),
          protection: {
            watermarkEnabled: true,
            tabWarningEnabled: false,
            tabWarningThreshold: 3,
          },
        }}
        progress={progress()}
      />
    );
    expect(container.querySelector('svg pattern')).not.toBeNull();
  });

  it('says why the Check was submitted and offers Try again', async () => {
    const onTryAgain = vi.fn().mockRejectedValueOnce(new Error('offline'));
    render(
      <FlashcardCheckResults
        session={{ ...session('none'), rules: RULES }}
        progress={{ ...progress(), forcedSubmit: 'time' }}
        onTryAgain={onTryAgain}
      />
    );
    expect(
      screen.getByText("Time's up. Your answers were submitted.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't start a new attempt. Try again.")
      ).toBeInTheDocument()
    );
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('shows the score, not "mastered", on a flashcards-mode Check submitted for the student', () => {
    render(
      <FlashcardCheckResults
        session={{
          ...session('score-only'),
          checkMode: 'flashcards',
          rules: RULES,
        }}
        progress={{ ...progress(), forcedSubmit: 'tab' }}
      />
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You left the check too many times, so it was submitted.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('falls back to the class level once a student setting has ended', () => {
    show('none', {
      mode: 'shown',
      visibility: 'score-only',
      publishedAt: 2,
      expiresAt: Date.now() - 1,
    });
    expect(screen.queryByText('1/2')).not.toBeInTheDocument();
  });
});
