import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Functions } from 'firebase/functions';

// Mock the CF wrapper at the @/utils/classroomGradePush seam (the documented
// boundary) so the fan-out tests exercise the real orchestration in
// runClassroomGradePush without a live backend. formatGradePushToast + the
// types come through from the real module. logError is silenced.
const pushMock =
  vi.fn<
    (
      functions: unknown,
      opts: { courseId: string; accessToken: string }
    ) => Promise<unknown>
  >();
vi.mock('@/utils/classroomGradePush', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/utils/classroomGradePush')>();
  return {
    ...actual,
    pushClassroomGradesForAssignment: (functions: unknown, opts: unknown) =>
      pushMock(functions, opts as { courseId: string; accessToken: string }),
  };
});
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import {
  isPushPermissionDenied,
  hasValidMaxPoints,
  runClassroomGradePush,
  type ClassroomGradePushAttachment,
  type ClassroomGradePushStatus,
} from '@/utils/runClassroomGradePush';

describe('isPushPermissionDenied', () => {
  it('is true for a Firebase callable permission-denied code', () => {
    expect(
      isPushPermissionDenied({ code: 'functions/permission-denied' })
    ).toBe(true);
    expect(isPushPermissionDenied({ code: 'permission-denied' })).toBe(true);
  });

  it('is false for a different string code', () => {
    expect(isPushPermissionDenied({ code: 'functions/unavailable' })).toBe(
      false
    );
  });

  it('is false (and does NOT throw) when code is a number', () => {
    // Regression: a non-Firebase error can carry a numeric code (e.g. 403 from
    // a raw Google API error). `.includes()` on a number would throw and turn a
    // handled error into an unhandled one if the type isn't guarded.
    expect(() => isPushPermissionDenied({ code: 403 })).not.toThrow();
    expect(isPushPermissionDenied({ code: 403 })).toBe(false);
  });

  it('is false for null, undefined, and non-objects', () => {
    expect(isPushPermissionDenied(null)).toBe(false);
    expect(isPushPermissionDenied(undefined)).toBe(false);
    // A bare string isn't a callable error — we only inspect `.code`.
    expect(isPushPermissionDenied('permission-denied')).toBe(false);
    // A plain Error has no `.code`; its message is intentionally not consulted.
    expect(isPushPermissionDenied(new Error('permission-denied'))).toBe(false);
  });
});

describe('hasValidMaxPoints', () => {
  it('is true only for a positive, finite number', () => {
    expect(hasValidMaxPoints(20)).toBe(true);
    expect(hasValidMaxPoints(0)).toBe(false);
    expect(hasValidMaxPoints(-5)).toBe(false);
    expect(hasValidMaxPoints(Number.NaN)).toBe(false);
    expect(hasValidMaxPoints(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('runClassroomGradePush (multi-course fan-out)', () => {
  const fns = {} as unknown as Functions;
  const att = (id: string): ClassroomGradePushAttachment => ({
    courseId: `course-${id}`,
    itemId: `cw-${id}`,
    attachmentId: `att-${id}`,
    maxPoints: 20,
  });
  const GRADES = [{ pseudonymUid: 'p-A', pointsEarned: 8 }];

  beforeEach(() => {
    pushMock.mockReset();
  });

  it('is a benign no-op (nothing-to-push, no token mint) for an empty attachment list', async () => {
    const requestToken = vi.fn<() => Promise<string>>();
    const phases: ClassroomGradePushStatus['phase'][] = [];
    const onError = vi.fn();

    await runClassroomGradePush({
      functions: fns,
      attachments: [],
      buildGrades: () => GRADES,
      requestToken,
      onStatus: (s) => phases.push(s.phase),
      onError,
      logTag: 'test',
    });

    // No consent popup, no CF call, and crucially NOT the all-failed onError
    // path (which would show a hard "could not push" error for a no-op).
    expect(requestToken).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(phases).toContain('nothing-to-push');
    expect(phases).not.toContain('start');
  });

  it('mints the token ONCE and pushes to every course, aggregating the counts', async () => {
    pushMock.mockResolvedValue({
      results: [],
      pushed: 1,
      skipped: 0,
      failed: 0,
    });
    const requestToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue('tok');
    let pushedData: { pushed: number; failed: number } | null = null;

    await runClassroomGradePush({
      functions: fns,
      attachments: [att('A'), att('B')],
      buildGrades: () => GRADES,
      requestToken,
      onStatus: (s) => {
        if (s.phase === 'pushed') {
          pushedData = s.data as { pushed: number; failed: number };
        }
      },
      onError: vi.fn(),
      logTag: 'test',
    });

    // One consent popup reused across both courses; one CF call per course.
    expect(requestToken).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(pushMock.mock.calls[0][1].accessToken).toBe('tok');
    expect(pushMock.mock.calls[1][1].accessToken).toBe('tok');
    expect(pushMock.mock.calls.map((c) => c[1].courseId)).toEqual([
      'course-A',
      'course-B',
    ]);
    expect(pushedData).toMatchObject({ pushed: 2, failed: 0 });
  });

  it('on an all-course failure, reports permissionDenied when ANY course was permission-denied (not just the last)', async () => {
    // Course A: permission-denied; course B: a plain network failure. The OR
    // accumulator must still surface the actionable "link to ClassLink" copy.
    pushMock
      .mockRejectedValueOnce({ code: 'functions/permission-denied' })
      .mockRejectedValueOnce({ code: 'functions/unavailable' });
    const requestToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValue('tok');
    let errArg: { permissionDenied: boolean } | null = null;

    await runClassroomGradePush({
      functions: fns,
      attachments: [att('A'), att('B')],
      buildGrades: () => GRADES,
      requestToken,
      onStatus: vi.fn(),
      onError: (e) => {
        errArg = e as { permissionDenied: boolean };
      },
      logTag: 'test',
    });

    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(errArg).toMatchObject({ permissionDenied: true });
  });
});
