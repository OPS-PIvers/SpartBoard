/**
 * Unit tests for unifyAssignableQuizzes — pure read-time union of the PLC
 * quiz library (`PlcQuizEntry[]`) with the legacy assignment-template
 * library (`PlcAssignmentTemplate[]`). No React, no Firebase.
 *
 * Coverage:
 *   - quiz-only input
 *   - template-only input
 *   - dedup when a quiz and a template share a syncGroupId (quiz wins)
 *   - run-settings fallback for a legacy quiz with no settings
 */

import { describe, it, expect } from 'vitest';
import {
  unifyAssignableQuizzes,
  type AssignableQuizRow,
} from '@/components/plc/bodies/unifyAssignableQuizzes';
import { DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import type {
  PlcAssignmentTemplate,
  PlcQuizEntry,
  QuizSessionOptions,
} from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEMPLATE_OPTIONS: QuizSessionOptions = {
  tabWarningsEnabled: false,
  showResultToStudent: true,
  shuffleAnswerOptions: false,
};

function makeQuiz(overrides: Partial<PlcQuizEntry> = {}): PlcQuizEntry {
  return {
    id: 'q1',
    title: 'Fractions Quiz',
    questionCount: 5,
    syncGroupId: 'group-q1',
    sharedBy: 'uid-alice',
    sharedByEmail: 'alice@example.com',
    sharedByName: 'Alice',
    sharedAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function makeTemplate(
  overrides: Partial<PlcAssignmentTemplate> = {}
): PlcAssignmentTemplate {
  return {
    id: 't1',
    quizTitle: 'Decimals Template',
    quizId: 'src-quiz-1',
    syncGroupId: 'group-t1',
    sessionMode: 'auto',
    sessionOptions: TEMPLATE_OPTIONS,
    attemptLimit: 3,
    sharedBy: 'uid-bob',
    sharedByEmail: 'bob@example.com',
    sharedByName: 'Bob',
    sharedAt: 1500,
    updatedAt: 2500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unifyAssignableQuizzes', () => {
  it('returns quiz rows when only quizzes are present', () => {
    const quiz = makeQuiz({
      sessionMode: 'student',
      sessionOptions: { shuffleQuestions: true },
      attemptLimit: null,
    });
    const rows = unifyAssignableQuizzes([quiz], []);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.source).toBe('quiz');
    expect(row.syncGroupId).toBe('group-q1');
    expect(row.title).toBe('Fractions Quiz');
    expect(row.sessionMode).toBe('student');
    expect(row.sessionOptions).toEqual({ shuffleQuestions: true });
    expect(row.attemptLimit).toBeNull();
    expect(row.sharedBy).toBe('uid-alice');
    expect(row.sharedByName).toBe('Alice');
    if (row.source === 'quiz') {
      expect(row.quiz).toBe(quiz);
    }
  });

  it('returns template rows when only templates are present', () => {
    const template = makeTemplate();
    const rows = unifyAssignableQuizzes([], [template]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.source).toBe('template');
    expect(row.syncGroupId).toBe('group-t1');
    expect(row.title).toBe('Decimals Template');
    expect(row.sessionMode).toBe('auto');
    expect(row.sessionOptions).toBe(TEMPLATE_OPTIONS);
    expect(row.attemptLimit).toBe(3);
    expect(row.sharedBy).toBe('uid-bob');
    if (row.source === 'template') {
      expect(row.template).toBe(template);
    }
  });

  it('dedupes by syncGroupId — the quiz wins over a same-group template', () => {
    const shared = 'group-shared';
    const quiz = makeQuiz({
      id: 'q-shared',
      syncGroupId: shared,
      title: 'Canonical Quiz',
      updatedAt: 9000,
    });
    // Template points at the SAME canonical content; should be dropped.
    const template = makeTemplate({
      id: 't-shared',
      syncGroupId: shared,
      quizTitle: 'Stale Template Title',
      updatedAt: 9999,
    });

    const rows = unifyAssignableQuizzes([quiz], [template]);

    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('quiz');
    expect(rows[0].syncGroupId).toBe(shared);
    expect(rows[0].title).toBe('Canonical Quiz');
  });

  it('keeps template-only rows alongside quiz rows (no false dedup)', () => {
    const quiz = makeQuiz({ syncGroupId: 'group-a', updatedAt: 100 });
    const template = makeTemplate({ syncGroupId: 'group-b', updatedAt: 200 });

    const rows = unifyAssignableQuizzes([quiz], [template]);

    expect(rows).toHaveLength(2);
    // Sorted by updatedAt desc — template (200) before quiz (100).
    expect(rows.map((r) => r.source)).toEqual(['template', 'quiz']);
  });

  it('falls back to default run-settings for a legacy quiz with none', () => {
    const legacy = makeQuiz({
      sessionMode: undefined,
      sessionOptions: undefined,
      attemptLimit: undefined,
    });
    const rows = unifyAssignableQuizzes([legacy], []);

    const row = rows[0];
    expect(row.sessionMode).toBe(DEFAULT_QUIZ_BEHAVIOR.sessionMode);
    expect(row.sessionOptions).toBe(DEFAULT_QUIZ_BEHAVIOR.sessionOptions);
    expect(row.attemptLimit).toBe(DEFAULT_QUIZ_BEHAVIOR.attemptLimit);
  });

  it('preserves an explicit null attemptLimit on a quiz (no default override)', () => {
    const row: AssignableQuizRow = unifyAssignableQuizzes(
      [makeQuiz({ attemptLimit: null })],
      []
    )[0];
    expect(row.attemptLimit).toBeNull();
  });
});
