/**
 * Regression test for the normalizeSession field-stripping bug.
 *
 * Root cause: the internal `normalizeSession` in `useVideoActivitySession.ts`
 * returned a hand-enumerated literal that silently dropped every optional field
 * on `VideoActivitySession` not explicitly listed — including `classIds`,
 * `classId`, `sessionOptions`, `ltiAttachment`, `revealedAnswers`, `mode`,
 * `periodNames`, `rosterIds`, `classPeriodByClassId`, `sync`, `ltiNrps`.
 *
 * Impact: `subscribeToSession`'s `onSnapshot` callback runs the normalizer on
 * every live update. Once the first snapshot arrived, `liveSession` replaced
 * `selectedSession` in `VideoActivityWidget/Widget.tsx`, and
 * `VideoActivityLiveMonitor` received a session object missing `classIds` /
 * `classId` → `useAssignmentPseudonymsMulti` was called with an empty class
 * list → all ClassLink SSO student display names disappeared from the live
 * monitor mid-session without any error surfacing.
 *
 * Fix: extracted `normalizeSession` to `utils/videoActivityNormalize.ts` as
 * the exported `normalizeVideoActivitySession`. The function now spreads
 * `...data` as the first property of the returned object so all unrecognized
 * optional fields survive, then overrides only the fields that require
 * normalization or defaulting.
 *
 * This test imports the real exported function so a regression (removing
 * `...data`) would immediately cause the "preserves optional fields" tests
 * to fail.
 */

import { describe, it, expect } from 'vitest';
import { normalizeVideoActivitySession } from '@/utils/videoActivityNormalize';

// ─── helpers ─────────────────────────────────────────────────────────────────

const SESSION_ID = 'sess-001';

/** Minimal required fields that normalizeVideoActivitySession must default. */
const MINIMAL_INPUT = {
  activityId: 'act-1',
  activityTitle: 'Test Video',
  assignmentName: 'Test Assignment',
  teacherUid: 'teacher-uid',
  youtubeUrl: 'https://youtu.be/abc',
  questions: [],
  status: 'active' as const,
  allowedPins: [],
  createdAt: 1_700_000_000_000,
};

// ─── optional field preservation ─────────────────────────────────────────────

describe('normalizeVideoActivitySession — optional field preservation', () => {
  it('preserves classIds when present', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      classIds: ['class-a', 'class-b'],
    });
    expect(result.classIds).toEqual(['class-a', 'class-b']);
  });

  it('preserves classId (legacy) when present', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      classId: 'class-legacy',
    });
    expect(result.classId).toBe('class-legacy');
  });

  it('preserves sessionOptions when present', () => {
    const opts = {
      attemptLimit: 3,
      rewindOnIncorrectSeconds: 10,
      pointPenaltyOnIncorrect: 1,
    };
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      sessionOptions: opts,
    });
    expect(result.sessionOptions).toEqual(opts);
  });

  it('preserves mode when present', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      mode: 'submissions',
    });
    expect(result.mode).toBe('submissions');
  });

  it('preserves periodNames when present', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      periodNames: ['Period 1', 'Period 2'],
    });
    expect(result.periodNames).toEqual(['Period 1', 'Period 2']);
  });

  it('preserves rosterIds when present', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      rosterIds: ['roster-1'],
    });
    expect(result.rosterIds).toEqual(['roster-1']);
  });

  it('preserves classPeriodByClassId when present', () => {
    const map = { 'class-a': 'Period 1' };
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      classPeriodByClassId: map,
    });
    expect(result.classPeriodByClassId).toEqual(map);
  });
});

// ─── required field normalization (these must still be overridden) ────────────

describe('normalizeVideoActivitySession — required field defaults', () => {
  it('sets id from sessionId argument (overrides any id in data)', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      id: 'wrong-id',
    });
    expect(result.id).toBe(SESSION_ID);
  });

  it('defaults activityTitle to "Video Activity" when absent', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      activityTitle: undefined,
    });
    expect(result.activityTitle).toBe('Video Activity');
  });

  it('defaults activityId to empty string when absent', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      activityId: undefined,
    });
    expect(result.activityId).toBe('');
  });

  it('defaults teacherUid to empty string when absent', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      teacherUid: undefined,
    });
    expect(result.teacherUid).toBe('');
  });

  it('defaults status to "active" for any non-ended value', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      status: undefined,
    });
    expect(result.status).toBe('active');
  });

  it('preserves "ended" status correctly', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      status: 'ended',
    });
    expect(result.status).toBe('ended');
  });

  it('defaults allowedPins to empty array when absent', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      allowedPins: undefined,
    });
    expect(result.allowedPins).toEqual([]);
  });

  it('defaults settings.requireCorrectAnswer to true', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      settings: undefined,
    });
    expect(result.settings?.requireCorrectAnswer).toBe(true);
  });

  it('generates assignmentName from title + date when assignmentName is blank', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      assignmentName: '',
      activityTitle: 'Science Quiz',
      createdAt: 1_700_000_000_000,
    });
    expect(result.assignmentName).toMatch(/Science Quiz/);
  });

  it('preserves a non-blank assignmentName', () => {
    const result = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      assignmentName: 'My Assignment',
    });
    expect(result.assignmentName).toBe('My Assignment');
  });

  it('includes endedAt only when numeric', () => {
    const withEnd = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      endedAt: 1_700_000_001_000,
    });
    expect(withEnd.endedAt).toBe(1_700_000_001_000);

    const withoutEnd = normalizeVideoActivitySession(SESSION_ID, MINIMAL_INPUT);
    expect(withoutEnd.endedAt).toBeUndefined();
  });

  it('includes expiresAt only when numeric', () => {
    const withExpiry = normalizeVideoActivitySession(SESSION_ID, {
      ...MINIMAL_INPUT,
      expiresAt: 1_700_000_002_000,
    });
    expect(withExpiry.expiresAt).toBe(1_700_000_002_000);

    const withoutExpiry = normalizeVideoActivitySession(
      SESSION_ID,
      MINIMAL_INPUT
    );
    expect(withoutExpiry.expiresAt).toBeUndefined();
  });
});
