import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GuidedLearningStep,
  VideoActivityQuestion,
  VideoActivityResponse,
} from '@/types';

const docs = new Map<string, Record<string, unknown>>();
const writes: { path: string; patch: Record<string, unknown> }[] = [];
const DELETE = { __delete: true };

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: (path: string) =>
    Promise.resolve({
      ref: path,
      exists: () => docs.has(path),
      data: () => docs.get(path),
    }),
  writeBatch: () => {
    const pending: typeof writes = [];
    return {
      update: (path: string, patch: Record<string, unknown>) => {
        pending.push({ path, patch });
      },
      commit: () => {
        writes.push(...pending);
        return Promise.resolve();
      },
    };
  },
  deleteField: () => DELETE,
}));

import {
  clearResultsOverride,
  gradeVideoActivityResponseForPublish,
  hideResultsForStudents,
  publishGuidedLearningResultsForStudents,
  publishVideoActivityResultsForStudents,
} from './studentResultsPublish';

const vaQ = (id: string, correctAnswer: string, points = 1) =>
  ({
    id,
    type: 'MC',
    text: id,
    timestamp: 0,
    choices: ['a', 'b'],
    correctAnswer,
    points,
  }) as unknown as VideoActivityQuestion;

const glMc = (id: string, correctAnswer: string): GuidedLearningStep => ({
  id,
  xPct: 0,
  yPct: 0,
  imageIndex: 0,
  interactionType: 'question',
  question: {
    type: 'multiple-choice',
    text: id,
    choices: ['a', 'b'],
    correctAnswer,
  },
});

beforeEach(() => {
  docs.clear();
  writes.length = 0;
});

describe('gradeVideoActivityResponseForPublish', () => {
  it('counts unanswered questions and one answer per question', () => {
    const questions = [vaQ('q1', 'a', 2), vaQ('q2', 'b')];
    const response = {
      answers: [
        { questionId: 'q1', answer: 'a', answeredAt: 1 },
        { questionId: 'q1', answer: 'a', answeredAt: 2 },
      ],
    } as unknown as VideoActivityResponse;
    const graded = gradeVideoActivityResponseForPublish(
      response,
      new Map(questions.map((q) => [q.id, q]))
    );
    expect(graded.score).toBe(67);
    expect(graded.answers.every((a) => a.isCorrect === true)).toBe(true);
  });
});

describe('publishVideoActivityResultsForStudents', () => {
  it('grades and shows finished responses and skips the rest', async () => {
    docs.set('video_activity_sessions/s1', {});
    docs.set('video_activity_sessions/s1/responses/done', {
      completedAt: 5,
      answers: [{ questionId: 'q1', answer: 'a' }],
    });
    docs.set('video_activity_sessions/s1/responses/working', {
      completedAt: null,
      answers: [],
    });
    const result = await publishVideoActivityResultsForStudents(
      's1',
      [vaQ('q1', 'a'), vaQ('q2', 'b')],
      ['done', 'working', 'missing'],
      'score-only',
      null
    );
    expect(result).toEqual({ responsesUpdated: 1, skipped: 2 });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('video_activity_sessions/s1/responses/done');
    expect(writes[0].patch.score).toBe(50);
    expect(writes[0].patch.resultsOverride).toMatchObject({
      mode: 'shown',
      visibility: 'score-only',
      expiresAt: null,
    });
    expect(writes[0].patch.resultsOverride).not.toHaveProperty(
      'revealedAnswers'
    );
  });
});

describe('publishGuidedLearningResultsForStudents', () => {
  it('carries the answer key only at the answers level', async () => {
    docs.set('guided_learning_sessions/g1/responses/u1', {
      completedAt: 5,
      answers: [{ stepId: 's1', answer: 'b', isCorrect: null }],
    });
    const result = await publishGuidedLearningResultsForStudents(
      'g1',
      [glMc('s1', 'b'), glMc('s2', 'a')],
      ['u1'],
      'score-responses-and-answers',
      99
    );
    expect(result).toEqual({ responsesUpdated: 1, skipped: 0 });
    expect(writes[0].patch.score).toBe(50);
    expect(writes[0].patch.resultsOverride).toMatchObject({
      mode: 'shown',
      visibility: 'score-responses-and-answers',
      expiresAt: 99,
      revealedAnswers: { s1: 'b', s2: 'a' },
    });
  });
});

describe('hide and clear', () => {
  it('writes a hidden override, then removes it', async () => {
    await hideResultsForStudents('guided_learning_sessions', 'g1', [
      'u1',
      'u1',
    ]);
    expect(writes).toHaveLength(1);
    expect(writes[0].patch.resultsOverride).toMatchObject({ mode: 'hidden' });
    await clearResultsOverride('guided_learning_sessions', 'g1', ['u1']);
    expect(writes[1].patch.resultsOverride).toBe(DELETE);
  });
});
