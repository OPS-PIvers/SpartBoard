import { describe, expect, it } from 'vitest';
import type { GuidedLearningResponse } from '@/types';
import { guidedLearningLiveRaw } from '@/utils/gradebook/liveRawScores';
import { hasGradebookResultsView } from '@/utils/gradebook/resultsView';
import type { GradebookKind } from '@/utils/gradebook/gradebookCore';
import { formatLastActive } from '@/utils/viewAsFormat';
import {
  buildDistribution,
  distributionFromAnswers,
} from '@/utils/answerDistribution';

const grade = (_q: unknown, answer: string) => ({
  isCorrect: answer.trim().toLowerCase() === 'paris',
});

const glResponse = (completedAt: number | null) =>
  ({ completedAt }) as unknown as GuidedLearningResponse;

describe('guidedLearningLiveRaw', () => {
  it('is not attempted until completed', () => {
    expect(guidedLearningLiveRaw(glResponse(null), 3, 5)).toEqual({
      points: null,
      max: null,
      state: 'not-attempted',
      submittedAt: null,
    });
  });

  it('keeps the submit time but no score when there are no question steps', () => {
    expect(guidedLearningLiveRaw(glResponse(100), 0, 0)).toEqual({
      points: null,
      max: null,
      state: 'not-attempted',
      submittedAt: 100,
    });
  });

  it('scores correct steps over question steps', () => {
    expect(guidedLearningLiveRaw(glResponse(200), 3, 5)).toEqual({
      points: 3,
      max: 5,
      state: 'scored',
      submittedAt: 200,
    });
  });
});

describe('hasGradebookResultsView', () => {
  it('is true only for the kinds with a Results view', () => {
    for (const kind of ['quiz', 'video-activity', 'guided-learning']) {
      expect(hasGradebookResultsView(kind as GradebookKind)).toBe(true);
    }
    for (const kind of [
      'flashcards',
      'projects',
      'mini-app',
      'activity-wall',
    ]) {
      expect(hasGradebookResultsView(kind as GradebookKind)).toBe(false);
    }
  });
});

describe('formatLastActive', () => {
  const now = Date.UTC(2026, 10, 9, 12, 0, 0);

  it('handles a missing timestamp', () => {
    expect(formatLastActive(0, now)).toBe('No recent activity');
  });

  it('formats minutes, hours and older dates', () => {
    expect(formatLastActive(now - 30_000, now)).toBe('Active just now');
    expect(formatLastActive(now - 5 * 60_000, now)).toBe('Active 5 min ago');
    expect(formatLastActive(now - 59 * 60_000, now)).toBe('Active 59 min ago');
    expect(formatLastActive(now - 60 * 60_000, now)).toBe('Active 1 h ago');
    expect(formatLastActive(now - 23 * 3_600_000, now)).toBe('Active 23 h ago');
    expect(formatLastActive(now - 48 * 3_600_000, now)).toMatch(/^Active \S+/);
    expect(formatLastActive(now - 48 * 3_600_000, now)).not.toMatch(/ h ago$/);
  });
});

describe('answer distributions', () => {
  const mc = {
    id: 'q1',
    type: 'MC' as const,
    correctAnswer: 'Paris',
    incorrectAnswers: ['Rome', 'Oslo', ''],
  };

  it('lists every MC option in order, counting picks and flagging the key', () => {
    const dist = distributionFromAnswers(
      mc,
      ['Paris', 'Rome', 'paris', 'Mars'],
      grade
    );
    expect(dist.totalAnswered).toBe(4);
    expect(dist.rows.map((r) => [r.label, r.count, r.isCorrect])).toEqual([
      ['Paris', 2, true],
      ['Rome', 1, false],
      ['Oslo', 0, false],
    ]);
  });

  it('skips responses without an answer for the question', () => {
    const dist = buildDistribution(
      mc,
      [
        { answers: [{ questionId: 'q1', answer: 'Rome' }] },
        { answers: [{ questionId: 'other', answer: 'Paris' }] },
        { answers: [] },
      ],
      grade
    );
    expect(dist.totalAnswered).toBe(1);
    expect(dist.rows.find((r) => r.label === 'Rome')?.count).toBe(1);
  });

  it('groups free-form answers by normalized text, most common first', () => {
    const sa = {
      type: 'FIB' as const,
      correctAnswer: 'Paris',
      incorrectAnswers: [] as string[],
    };
    const dist = distributionFromAnswers(
      sa,
      ['Lyon', 'Paris', ' paris'],
      grade
    );
    expect(dist.rows[0]).toMatchObject({ count: 2, isCorrect: true });
    expect(dist.rows[1]).toMatchObject({
      label: 'Lyon',
      count: 1,
      isCorrect: false,
    });
  });
});
