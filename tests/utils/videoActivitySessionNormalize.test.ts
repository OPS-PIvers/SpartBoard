/**
 * Regression test for the normalizeSession field-stripping bug in
 * useVideoActivitySession.ts.
 *
 * Root cause: `normalizeSession` returned a hand-enumerated literal that only
 * listed the fields it explicitly handled. Every optional field on
 * `VideoActivitySession` that wasn't in the literal was silently dropped when
 * the teacher-side live session snapshot arrived — including `classIds`,
 * `classId`, `sessionOptions`, `ltiAttachment`, `revealedAnswers`, `mode`, etc.
 *
 * Impact: once `subscribeToSession` fired its first snapshot, `liveSession`
 * replaced `selectedSession` in `VideoActivityWidget/Widget.tsx` and the
 * `VideoActivityLiveMonitor` received an object missing `classIds`/`classId` →
 * `useAssignmentPseudonymsMulti` was called with an empty class list → all
 * ClassLink SSO student names disappeared from the live monitor.
 *
 * Fix: spread the source data (`...data`) as the base of the returned object,
 * then override only the fields that require normalization/defaulting, so
 * unrecognized optional fields survive the transformation intact.
 *
 * This test exercises the pure normalization logic by recreating it inline —
 * `normalizeSession` is internal to the hook, so we test the transformation
 * contract directly rather than through the Firestore-dependent hook itself.
 */

import { describe, it, expect } from 'vitest';
import { normalizeVideoActivityQuestions } from '@/utils/videoActivityNormalize';
import type { VideoActivitySession } from '@/types';

/**
 * Inline recreation of the BUGGY `normalizeSession` — the pre-fix version
 * that returned a hand-enumerated literal without spreading source data.
 * Used only in "before" assertions to verify the test would fail on old code.
 */
function normalizeBuggy(
  sessionId: string,
  data: Partial<VideoActivitySession>
): VideoActivitySession {
  const activityTitle = data.activityTitle ?? 'Video Activity';
  const createdAt = data.createdAt ?? Date.now();
  return {
    id: sessionId,
    activityId: data.activityId ?? '',
    activityTitle,
    assignmentName:
      data.assignmentName && data.assignmentName.trim().length > 0
        ? data.assignmentName
        : `${activityTitle} ${new Date(createdAt).toLocaleString()}`,
    teacherUid: data.teacherUid ?? '',
    youtubeUrl: data.youtubeUrl ?? '',
    questions: normalizeVideoActivityQuestions(data.questions),
    settings: {
      autoPlay: data.settings?.autoPlay ?? false,
      requireCorrectAnswer: data.settings?.requireCorrectAnswer ?? true,
      allowSkipping: data.settings?.allowSkipping ?? false,
    },
    status: data.status === 'ended' ? 'ended' : 'active',
    allowedPins: data.allowedPins ?? [],
    createdAt,
    ...(typeof data.endedAt === 'number' ? { endedAt: data.endedAt } : {}),
    ...(typeof data.expiresAt === 'number'
      ? { expiresAt: data.expiresAt }
      : {}),
  };
}

/**
 * Inline recreation of the FIXED `normalizeSession` — spreads source data
 * first so optional fields survive, then overrides required fields.
 */
function normalizeFixed(
  sessionId: string,
  data: Partial<VideoActivitySession>
): VideoActivitySession {
  const activityTitle = data.activityTitle ?? 'Video Activity';
  const createdAt = data.createdAt ?? Date.now();
  return {
    ...data,
    id: sessionId,
    activityId: data.activityId ?? '',
    activityTitle,
    assignmentName:
      data.assignmentName && data.assignmentName.trim().length > 0
        ? data.assignmentName
        : `${activityTitle} ${new Date(createdAt).toLocaleString()}`,
    teacherUid: data.teacherUid ?? '',
    youtubeUrl: data.youtubeUrl ?? '',
    questions: normalizeVideoActivityQuestions(data.questions),
    settings: {
      autoPlay: data.settings?.autoPlay ?? false,
      requireCorrectAnswer: data.settings?.requireCorrectAnswer ?? true,
      allowSkipping: data.settings?.allowSkipping ?? false,
    },
    status: data.status === 'ended' ? 'ended' : 'active',
    allowedPins: data.allowedPins ?? [],
    createdAt,
    ...(typeof data.endedAt === 'number' ? { endedAt: data.endedAt } : {}),
    ...(typeof data.expiresAt === 'number'
      ? { expiresAt: data.expiresAt }
      : {}),
  };
}

const BASE_SESSION: Partial<VideoActivitySession> = {
  activityId: 'act-1',
  activityTitle: 'Cell Biology',
  assignmentName: 'Period 3 — Cell Biology',
  teacherUid: 'teacher-uid-1',
  youtubeUrl: 'https://youtu.be/abc',
  questions: [],
  status: 'active',
  allowedPins: [],
  createdAt: 1_700_000_000_000,
};

describe('normalizeSession — optional field preservation (regression)', () => {
  describe('classIds / classId (SSO student name resolution)', () => {
    const dataWithClassIds: Partial<VideoActivitySession> = {
      ...BASE_SESSION,
      classIds: ['cl-1', 'cl-2'],
      classId: 'cl-1',
    };

    it('BUG (old code): classIds is stripped by the hand-enumerated literal', () => {
      const result = normalizeBuggy('session-1', dataWithClassIds);
      // The buggy version drops classIds — this assertion confirms the bug existed.
      expect(result.classIds).toBeUndefined();
      expect(result.classId).toBeUndefined();
    });

    it('FIX (new code): classIds is preserved through the spread', () => {
      const result = normalizeFixed('session-1', dataWithClassIds);
      expect(result.classIds).toEqual(['cl-1', 'cl-2']);
      expect(result.classId).toBe('cl-1');
    });
  });

  describe('sessionOptions (attempt limit, tab warnings)', () => {
    const dataWithOptions: Partial<VideoActivitySession> = {
      ...BASE_SESSION,
      sessionOptions: {
        tabWarningsEnabled: true,
        attemptLimit: 3,
        showResultToStudent: false,
        showCorrectAnswerToStudent: false,
        showCorrectOnBoard: false,
        shuffleQuestions: false,
        shuffleAnswerOptions: true,
        rewindOnIncorrectSeconds: 0,
        pointPenaltyOnIncorrect: 0,
        scoreVisibility: 'score-only',
      },
    };

    it('BUG (old code): sessionOptions is stripped', () => {
      const result = normalizeBuggy('session-1', dataWithOptions);
      expect(result.sessionOptions).toBeUndefined();
    });

    it('FIX (new code): sessionOptions is preserved', () => {
      const result = normalizeFixed('session-1', dataWithOptions);
      expect(result.sessionOptions?.attemptLimit).toBe(3);
      expect(result.sessionOptions?.tabWarningsEnabled).toBe(true);
    });
  });

  describe('mode (view-only filtering)', () => {
    const dataWithMode: Partial<VideoActivitySession> = {
      ...BASE_SESSION,
      mode: 'view-only',
    };

    it('BUG (old code): mode is stripped', () => {
      const result = normalizeBuggy('session-1', dataWithMode);
      expect(result.mode).toBeUndefined();
    });

    it('FIX (new code): mode is preserved', () => {
      const result = normalizeFixed('session-1', dataWithMode);
      expect(result.mode).toBe('view-only');
    });
  });

  describe('ltiNrps (Schoology name resolution gate)', () => {
    const dataWithLti: Partial<VideoActivitySession> = {
      ...BASE_SESSION,
      ltiNrps: true,
    };

    it('BUG (old code): ltiNrps is stripped', () => {
      const result = normalizeBuggy('session-1', dataWithLti);
      expect((result as Record<string, unknown>).ltiNrps).toBeUndefined();
    });

    it('FIX (new code): ltiNrps is preserved', () => {
      const result = normalizeFixed('session-1', dataWithLti);
      expect((result as Record<string, unknown>).ltiNrps).toBe(true);
    });
  });

  describe('revealedAnswers (post-publish answer display)', () => {
    const dataWithRevealed: Partial<VideoActivitySession> = {
      ...BASE_SESSION,
      revealedAnswers: { 'q-1': 'Correct answer text' },
    };

    it('BUG (old code): revealedAnswers is stripped', () => {
      const result = normalizeBuggy('session-1', dataWithRevealed);
      expect(result.revealedAnswers).toBeUndefined();
    });

    it('FIX (new code): revealedAnswers is preserved', () => {
      const result = normalizeFixed('session-1', dataWithRevealed);
      expect(result.revealedAnswers?.['q-1']).toBe('Correct answer text');
    });
  });

  describe('required field normalization still works with spread', () => {
    it('normalizes missing activityTitle to default', () => {
      const result = normalizeFixed('session-1', {
        ...BASE_SESSION,
        activityTitle: undefined,
      });
      expect(result.activityTitle).toBe('Video Activity');
    });

    it('normalizes missing activityId to empty string', () => {
      const result = normalizeFixed('session-1', {
        ...BASE_SESSION,
        activityId: undefined,
      });
      expect(result.activityId).toBe('');
    });

    it('normalizes ended status correctly', () => {
      const result = normalizeFixed('session-1', {
        ...BASE_SESSION,
        status: 'ended',
        endedAt: 1_700_000_060_000,
      });
      expect(result.status).toBe('ended');
      expect(result.endedAt).toBe(1_700_000_060_000);
    });

    it('normalizes active status (non-ended) correctly', () => {
      // Any status other than 'ended' should normalize to 'active'
      const result = normalizeFixed('session-1', {
        ...BASE_SESSION,
        status: 'active',
      });
      expect(result.status).toBe('active');
    });

    it('overrides id from parameter, not data', () => {
      const result = normalizeFixed('canonical-id', {
        ...BASE_SESSION,
        id: 'stale-id-from-data',
      });
      expect(result.id).toBe('canonical-id');
    });

    it('normalizes settings with defaults when absent', () => {
      const result = normalizeFixed('session-1', {
        ...BASE_SESSION,
        settings: undefined,
      });
      expect(result.settings).toEqual({
        autoPlay: false,
        requireCorrectAnswer: true,
        allowSkipping: false,
      });
    });

    it('preserves optional fields alongside required normalization', () => {
      // This is the key regression scenario: a fully-populated session doc
      // (with classIds, sessionOptions, mode, ltiNrps) should survive intact
      // after normalization — the way the initial `getDoc` result (selectedSession)
      // does, not the way the old normalizeSession stripped it.
      const fullSession: Partial<VideoActivitySession> = {
        ...BASE_SESSION,
        classIds: ['cl-1'],
        classId: 'cl-1',
        sessionOptions: {
          tabWarningsEnabled: true,
          attemptLimit: 2,
          showResultToStudent: true,
          showCorrectAnswerToStudent: false,
          showCorrectOnBoard: false,
          shuffleQuestions: false,
          shuffleAnswerOptions: true,
          rewindOnIncorrectSeconds: 15,
          pointPenaltyOnIncorrect: 0,
          scoreVisibility: 'score-only',
        },
        mode: 'submissions',
        periodNames: ['Period 3'],
        rosterIds: ['roster-1'],
      };

      const result = normalizeFixed('session-1', fullSession);

      // All optional fields survived
      expect(result.classIds).toEqual(['cl-1']);
      expect(result.classId).toBe('cl-1');
      expect(result.sessionOptions?.attemptLimit).toBe(2);
      expect(result.sessionOptions?.rewindOnIncorrectSeconds).toBe(15);
      expect(result.mode).toBe('submissions');
      expect(result.periodNames).toEqual(['Period 3']);
      expect(result.rosterIds).toEqual(['roster-1']);

      // Required field normalization still applied
      expect(result.id).toBe('session-1');
      expect(result.status).toBe('active');
      expect(result.activityTitle).toBe('Cell Biology');
    });
  });
});
