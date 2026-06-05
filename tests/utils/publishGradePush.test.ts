/**
 * Unit coverage for the "Publish = Push" orchestrator (utils/publishGradePush).
 * firebase/firestore (session read + responses fetch) and firebase/functions
 * (the two grade-push callables) are mocked so we exercise the chaining,
 * gating, and partial-success reporting without a live backend.
 */

/* eslint-disable @typescript-eslint/require-await -- mock handlers return
   Promise-shaped values without awaiting, matching the async production APIs. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Functions } from 'firebase/functions';

// ── firestore mock: session docs + responses keyed by ref path ──────────────
const sessionDocs = new Map<string, Record<string, unknown> | undefined>();
const responsesByPath = new Map<string, unknown[]>();

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  getDoc: async (ref: { path: string }) => {
    const data = sessionDocs.get(ref.path);
    return { exists: () => data !== undefined, data: () => data };
  },
  getDocs: async (ref: { path: string }) => {
    const list = responsesByPath.get(ref.path) ?? [];
    return { docs: list.map((d) => ({ data: () => d })) };
  },
}));

// ── functions mock: record callable calls, return seeded data / throw ───────
const callableCalls: Array<{ name: string; args: unknown }> = [];
const callableData = new Map<string, unknown>();
const callableErrors = new Map<string, unknown>();

vi.mock('firebase/functions', () => ({
  httpsCallable:
    (_functions: unknown, name: string) => async (args: unknown) => {
      callableCalls.push({ name, args });
      if (callableErrors.has(name)) throw callableErrors.get(name);
      return { data: callableData.get(name) };
    },
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

import {
  runPublishGradePush,
  CLASSROOM_PUSH_SKIPPED_NO_TOKEN,
} from '@/utils/publishGradePush';
import {
  PUSH_PERMISSION_DENIED_MESSAGE,
  GRADE_PUSH_GENERIC_ERROR_MESSAGE,
} from '@/utils/runClassroomGradePush';

const fns = {} as unknown as Functions;

const toasts: Array<{ message: string; type: string }> = [];
const addToast = (message: string, type: string) =>
  toasts.push({ message, type });

const ATTACHMENT = {
  courseId: 'C1',
  itemId: 'I1',
  attachmentId: 'ATT1',
  maxPoints: 20,
};

const GRADES = [{ pseudonymUid: 'p-A', pointsEarned: 8 }];

beforeEach(() => {
  sessionDocs.clear();
  responsesByPath.clear();
  callableCalls.length = 0;
  callableData.clear();
  callableErrors.clear();
  toasts.length = 0;
});

function baseOpts() {
  return {
    functions: fns,
    addToast,
    kind: 'quiz' as const,
    sessionId: 'S1',
    classroomAttachment: null,
    classroomToken: null as string | null,
    schoologyMaxPoints: 20,
    buildClassroomGrades: () => GRADES,
    buildSchoologyGrades: () => GRADES,
  };
}

describe('runPublishGradePush', () => {
  it('pushes FINAL grades to Google Classroom when linked + a token is present', async () => {
    callableData.set('pushClassroomFinalGradesForAssignment', {
      results: [],
      pushed: 1,
      skipped: 0,
      failed: 0,
    });

    await runPublishGradePush({
      ...baseOpts(),
      classroomAttachment: ATTACHMENT,
      classroomToken: 'tok',
    });

    const call = callableCalls.find(
      (c) => c.name === 'pushClassroomFinalGradesForAssignment'
    );
    expect(call).toBeDefined();
    expect(call?.args).toMatchObject({
      courseId: 'C1',
      itemId: 'I1',
      attachmentId: 'ATT1',
      accessToken: 'tok',
      grades: GRADES,
      maxPoints: 20,
    });
    expect(toasts.some((t) => t.type === 'success')).toBe(true);
  });

  it('skips GC with a clear note when linked but no token was minted (no callable)', async () => {
    await runPublishGradePush({
      ...baseOpts(),
      classroomAttachment: ATTACHMENT,
      classroomToken: null,
    });

    expect(
      callableCalls.some(
        (c) => c.name === 'pushClassroomFinalGradesForAssignment'
      )
    ).toBe(false);
    expect(
      toasts.find((t) => t.message === CLASSROOM_PUSH_SKIPPED_NO_TOKEN)
    ).toBeDefined();
  });

  it('pushes to Schoology when the SESSION doc carries an ltiAttachment', async () => {
    sessionDocs.set('quiz_sessions/S1', {
      ltiAttachment: { resourceLinkId: 'R1' },
    });
    callableData.set('ltiPushGradesForAssignmentV1', {
      results: [],
      pushed: 1,
      total: 1,
    });

    await runPublishGradePush(baseOpts());

    const call = callableCalls.find(
      (c) => c.name === 'ltiPushGradesForAssignmentV1'
    );
    expect(call).toBeDefined();
    expect(call?.args).toMatchObject({
      sessionId: 'S1',
      kind: 'quiz',
      maxPoints: 20,
      grades: GRADES,
    });
    expect(toasts.some((t) => t.type === 'success')).toBe(true);
  });

  it('pushes to BOTH Classroom and Schoology when both are linked', async () => {
    sessionDocs.set('quiz_sessions/S1', {
      ltiAttachment: { resourceLinkId: 'R1' },
    });
    callableData.set('pushClassroomFinalGradesForAssignment', {
      results: [],
      pushed: 1,
      skipped: 0,
      failed: 0,
    });
    callableData.set('ltiPushGradesForAssignmentV1', {
      results: [],
      pushed: 1,
      total: 1,
    });

    await runPublishGradePush({
      ...baseOpts(),
      classroomAttachment: ATTACHMENT,
      classroomToken: 'tok',
    });

    expect(
      callableCalls.some(
        (c) => c.name === 'pushClassroomFinalGradesForAssignment'
      )
    ).toBe(true);
    expect(
      callableCalls.some((c) => c.name === 'ltiPushGradesForAssignmentV1')
    ).toBe(true);
  });

  it('is a near no-op for a non-LMS assignment (no callables, no toasts)', async () => {
    await runPublishGradePush(baseOpts());
    expect(callableCalls).toHaveLength(0);
    expect(toasts).toHaveLength(0);
  });

  it('reports a permission-denied GC failure as an error toast and does NOT throw', async () => {
    callableErrors.set('pushClassroomFinalGradesForAssignment', {
      code: 'functions/permission-denied',
    });

    await expect(
      runPublishGradePush({
        ...baseOpts(),
        classroomAttachment: ATTACHMENT,
        classroomToken: 'tok',
      })
    ).resolves.toBeUndefined();

    expect(
      toasts.find(
        (t) =>
          t.message === PUSH_PERMISSION_DENIED_MESSAGE && t.type === 'error'
      )
    ).toBeDefined();
  });

  it('reports a partial GC push (failed > 0) as an error toast', async () => {
    callableData.set('pushClassroomFinalGradesForAssignment', {
      results: [],
      pushed: 2,
      skipped: 1,
      failed: 1,
    });

    await runPublishGradePush({
      ...baseOpts(),
      classroomAttachment: ATTACHMENT,
      classroomToken: 'tok',
    });

    expect(toasts.some((t) => t.type === 'error')).toBe(true);
  });

  it('does not call the GC CF when there are no eligible grades to push', async () => {
    await runPublishGradePush({
      ...baseOpts(),
      classroomAttachment: ATTACHMENT,
      classroomToken: 'tok',
      buildClassroomGrades: () => [],
    });

    expect(
      callableCalls.some(
        (c) => c.name === 'pushClassroomFinalGradesForAssignment'
      )
    ).toBe(false);
  });

  it('surfaces a generic GC error toast for a non-permission failure', async () => {
    callableErrors.set('pushClassroomFinalGradesForAssignment', {
      code: 'functions/internal',
    });

    await runPublishGradePush({
      ...baseOpts(),
      classroomAttachment: ATTACHMENT,
      classroomToken: 'tok',
    });

    expect(
      toasts.find(
        (t) =>
          t.message === GRADE_PUSH_GENERIC_ERROR_MESSAGE && t.type === 'error'
      )
    ).toBeDefined();
  });
});
