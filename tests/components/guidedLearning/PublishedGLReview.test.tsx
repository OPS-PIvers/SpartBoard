/**
 * Covers the progressive-disclosure contract for the student-facing
 * published-score review screen. The three visibility levels MUST gate
 * what the student sees on the `/my-assignments` Completed surface:
 *
 *   - score-only:                show percentage, hide per-step answers
 *   - score-and-responses:       show percentage + per-step student answers
 *                                tagged correct/incorrect, but NEVER the
 *                                canonical correct answer.
 *   - score-responses-and-answers: above + canonical correct answers
 *                                from session.revealedAnswers
 *
 * Without this test, a regression that swaps a `||` for `&&` (or that
 * accidentally renders revealedAnswers under score-and-responses) silently
 * leaks correct answers to students.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  PublishedGLReview,
  formatStudentAnswer,
} from '@/components/guidedLearning/GuidedLearningStudentApp';
import type { GuidedLearningSession, GuidedLearningResponse } from '@/types';

function fixture(overrides: {
  visibility: NonNullable<GuidedLearningSession['scoreVisibility']>;
  studentAnswer?: string | string[];
  isCorrect?: boolean | null;
  revealedAnswers?: Record<string, string>;
}): {
  session: GuidedLearningSession;
  myResponse: GuidedLearningResponse;
} {
  const session: GuidedLearningSession = {
    id: 'session-1',
    title: 'Photosynthesis review',
    mode: 'guided',
    imageUrls: [],
    publicSteps: [
      {
        id: 'step-mc',
        xPct: 0,
        yPct: 0,
        imageIndex: 0,
        label: 'Stage 1',
        interactionType: 'question',
        question: {
          type: 'multiple-choice',
          text: 'Which produces oxygen?',
          choices: ['Chlorophyll', 'Mitochondria'],
        },
      },
    ],
    teacherUid: 'teacher-1',
    createdAt: 0,
    scoreVisibility: overrides.visibility,
    revealedAnswers: overrides.revealedAnswers,
  };
  const myResponse: GuidedLearningResponse = {
    sessionId: 'session-1',
    studentAnonymousId: 'student-1',
    startedAt: 1,
    completedAt: 2,
    score: 50,
    answers: [
      {
        stepId: 'step-mc',
        answer: overrides.studentAnswer ?? 'Mitochondria',
        isCorrect: overrides.isCorrect ?? false,
      },
    ],
  };
  return { session, myResponse };
}

describe('PublishedGLReview', () => {
  it("'score-only' shows just the percentage and hides per-step rows", () => {
    const { session, myResponse } = fixture({ visibility: 'score-only' });
    render(
      <PublishedGLReview
        session={session}
        myResponse={myResponse}
        visibility="score-only"
      />
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
    // No per-step row — the student answer must NOT appear in the DOM.
    expect(screen.queryByText(/Mitochondria/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Your answer/)).not.toBeInTheDocument();
  });

  it("'score-and-responses' shows the student's answer + correct/incorrect, hides canonical answer", () => {
    const { session, myResponse } = fixture({
      visibility: 'score-and-responses',
      revealedAnswers: { 'step-mc': 'Chlorophyll' },
    });
    render(
      <PublishedGLReview
        session={session}
        myResponse={myResponse}
        visibility="score-and-responses"
      />
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
    // Student answer is visible.
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
    // Canonical correct answer must NOT leak — even though it lives in
    // the fixture, the visibility level forbids rendering it.
    expect(screen.queryByText('Chlorophyll')).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  });

  it("'score-responses-and-answers' surfaces the canonical correct answer", () => {
    const { session, myResponse } = fixture({
      visibility: 'score-responses-and-answers',
      revealedAnswers: { 'step-mc': 'Chlorophyll' },
    });
    render(
      <PublishedGLReview
        session={session}
        myResponse={myResponse}
        visibility="score-responses-and-answers"
      />
    );
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
    expect(screen.getByText('Chlorophyll')).toBeInTheDocument();
    expect(screen.getByText(/Correct answer/)).toBeInTheDocument();
  });

  it('does not show the canonical answer for steps the student got right (no need)', () => {
    const { session, myResponse } = fixture({
      visibility: 'score-responses-and-answers',
      studentAnswer: 'Chlorophyll',
      isCorrect: true,
      revealedAnswers: { 'step-mc': 'Chlorophyll' },
    });
    render(
      <PublishedGLReview
        session={session}
        myResponse={myResponse}
        visibility="score-responses-and-answers"
      />
    );
    // The student's correct answer shows; the "Correct answer:" reveal
    // label is reserved for the incorrect case.
    expect(screen.getByText('Chlorophyll')).toBeInTheDocument();
    expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
  });
});

describe('formatStudentAnswer', () => {
  it('renders string answers verbatim', () => {
    expect(formatStudentAnswer('My answer')).toBe('My answer');
  });

  it('returns empty string for undefined / empty', () => {
    expect(formatStudentAnswer(undefined)).toBe('');
    expect(formatStudentAnswer([])).toBe('');
  });

  it('splits matching pairs on the FIRST colon (not every colon)', () => {
    // Regression: previously `.replace(':')` swapped only the first ":"
    // but for "Ratio: 3:4" the first colon belongs to "Ratio:" — split
    // on indexOf so multi-colon labels stay legible.
    expect(formatStudentAnswer(['Ratio: 3:4'])).toBe('Ratio →  3:4');
    expect(formatStudentAnswer(['left:right'])).toBe('left → right');
  });

  it('joins multi-entry answers (sorting, matching) with newlines', () => {
    expect(formatStudentAnswer(['a:1', 'b:2'])).toBe('a → 1\nb → 2');
    // Sorting items don't contain colons and are joined verbatim.
    expect(formatStudentAnswer(['first', 'second', 'third'])).toBe(
      'first\nsecond\nthird'
    );
  });
});
