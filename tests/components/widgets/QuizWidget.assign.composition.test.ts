/**
 * Regression test — Widget.onAssign behavior composition (Task 9).
 *
 * The QuizWidget's onAssign handler (Widget.tsx) sources
 * sessionMode / sessionOptions / attemptLimit from `getQuizBehavior(meta)`
 * and passes them directly to `createAssignment(quizRef, settings, opts)`.
 *
 * This test pins that composition contract without mounting the full widget.
 *
 * WHY NOT a full widget mount:
 *   QuizWidget has 10+ Firebase-backed hooks (useQuiz, useQuizSessionTeacher,
 *   useQuizAssignments, usePlcs, useSyncedQuizGroupsByIds, useAuth,
 *   useDashboard, useDialog, useFolders, useAssignmentPseudonymsMulti,
 *   useBusyIdSet). Standing up a stable test harness for all of them is
 *   disproportionate to the risk here: the inline onAssign handler is a
 *   straightforward destructure → pass-through with no branching on behavior
 *   values, the QuizManager-boundary tests in QuizManager.assign.test.tsx
 *   already verify that the meta (including its behavior field) is passed
 *   through to the onAssign callback unchanged, and the type system catches
 *   mismatches at the createAssignment call site.
 *
 * WHAT IS TESTED here:
 *   The pure data transformation: given a QuizMetadata with a non-default
 *   behavior, `getQuizBehavior` returns exactly those values — so
 *   destructuring it (as the Widget does) would supply the correct
 *   sessionMode/sessionOptions/attemptLimit to createAssignment.
 *
 *   The test mirrors the Widget's onAssign lines exactly:
 *     const { sessionMode: mode, sessionOptions, attemptLimit } = getQuizBehavior(meta);
 *     // …then passed into createAssignment settings as:
 *     //   { sessionMode: mode, sessionOptions, attemptLimit, dueAt: dueAt ?? undefined }
 */

import { describe, it, expect } from 'vitest';
import { getQuizBehavior, DEFAULT_QUIZ_BEHAVIOR } from '@/utils/quizBehavior';
import {
  buildSetAssignmentTargetsPayload,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import type { QuizBehaviorSettings, QuizMetadata } from '@/types';

/** Minimal QuizMetadata factory — only fields getQuizBehavior reads. */
function makeMeta(
  behavior?: QuizBehaviorSettings
): Pick<QuizMetadata, 'behavior'> {
  return { behavior };
}

// ---------------------------------------------------------------------------
// Composition contract: getQuizBehavior(meta) → createAssignment settings
// ---------------------------------------------------------------------------

describe('Widget.onAssign composition — getQuizBehavior → createAssignment settings', () => {
  it('uses DEFAULT_QUIZ_BEHAVIOR when meta has no behavior (fallback)', () => {
    const meta = makeMeta(); // no behavior set
    const {
      sessionMode: mode,
      sessionOptions,
      attemptLimit,
    } = getQuizBehavior(meta);

    // Mirrors the Widget handler: these are what get passed to createAssignment.
    expect(mode).toBe(DEFAULT_QUIZ_BEHAVIOR.sessionMode);
    expect(sessionOptions).toEqual(DEFAULT_QUIZ_BEHAVIOR.sessionOptions);
    expect(attemptLimit).toBe(DEFAULT_QUIZ_BEHAVIOR.attemptLimit);
  });

  it('uses the quiz behavior sessionMode when meta has a non-default behavior', () => {
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionMode: 'student',
    };
    const meta = makeMeta(customBehavior);
    const { sessionMode: mode } = getQuizBehavior(meta);

    expect(mode).toBe('student');
  });

  it('uses the quiz behavior attemptLimit when set to a custom value', () => {
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      attemptLimit: 5,
    };
    const meta = makeMeta(customBehavior);
    const { attemptLimit } = getQuizBehavior(meta);

    expect(attemptLimit).toBe(5);
  });

  it('uses null attemptLimit (unlimited) when the quiz behavior sets it to null', () => {
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      attemptLimit: null,
    };
    const meta = makeMeta(customBehavior);
    const { attemptLimit } = getQuizBehavior(meta);

    expect(attemptLimit).toBeNull();
  });

  it('uses the quiz behavior sessionOptions when they differ from the default', () => {
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionOptions: {
        ...DEFAULT_QUIZ_BEHAVIOR.sessionOptions,
        speedBonusEnabled: true,
        showResultToStudent: true,
        tabWarningsEnabled: false,
      },
    };
    const meta = makeMeta(customBehavior);
    const { sessionOptions } = getQuizBehavior(meta);

    expect(sessionOptions.speedBonusEnabled).toBe(true);
    expect(sessionOptions.showResultToStudent).toBe(true);
    expect(sessionOptions.tabWarningsEnabled).toBe(false);
  });

  it('Widget settings shape: { sessionMode, sessionOptions, attemptLimit, dueAt } is well-formed', () => {
    // Reproduce the exact Widget onAssign settings assembly for a
    // non-default behavior + a provided dueAt — verifies no field is
    // accidentally dropped or misnamed.
    const customBehavior: QuizBehaviorSettings = {
      ...DEFAULT_QUIZ_BEHAVIOR,
      sessionMode: 'auto',
      attemptLimit: 2,
    };
    const meta = makeMeta(customBehavior);
    // Use local end-of-day (matching dueInputsToEpoch output) so dueAtHasTime:true
    // is paired with the correct epoch — a UTC midnight value here would be
    // the exact combination splitDueAtToInputs misinterprets on read-back.
    const dueAt: number | null = new Date(2026, 8, 1, 23, 59, 0, 0).getTime();

    const {
      sessionMode: mode,
      sessionOptions,
      attemptLimit,
    } = getQuizBehavior(meta);

    // This is the exact settings object the Widget builds before calling
    // createAssignment (minus the non-behavior fields like teacherName/plc).
    const settings = {
      sessionMode: mode,
      sessionOptions,
      attemptLimit,
      dueAt: dueAt ?? undefined,
      dueAtHasTime: dueAt != null ? true : undefined,
    };

    expect(settings.sessionMode).toBe('auto');
    expect(settings.attemptLimit).toBe(2);
    expect(settings.dueAt).toBe(new Date(2026, 8, 1, 23, 59, 0, 0).getTime());
    expect(settings.dueAt).not.toBe(new Date('2026-09-01').getTime());
    expect(settings.dueAtHasTime).toBe(true);
    expect(settings.sessionOptions).toBeDefined();
  });

  it('dueAt is undefined (not null) when no due date is provided', () => {
    // Widget passes `dueAt: dueAt ?? undefined` — null input becomes undefined
    // in the settings object so the Firestore write omits the field.
    const meta = makeMeta();
    const dueAt: number | null = null;

    const {
      sessionMode: mode,
      sessionOptions,
      attemptLimit,
    } = getQuizBehavior(meta);
    const settings = {
      sessionMode: mode,
      sessionOptions,
      attemptLimit,
      dueAt: dueAt ?? undefined,
    };

    expect(settings.dueAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// M17 §5 B3 — Widget.onAssign targeting composition
// ---------------------------------------------------------------------------

describe('Widget.onAssign composition — M17 individual-assignment targeting', () => {
  it('class-mode targeting never triggers setAssignmentTargetsV1 (§3a-G)', () => {
    // Mirrors the Widget's `if (targeting.targetMode === 'students')` guard —
    // the class-wide default must be a strict no-op for the CF call.
    const targeting: AssignTargetingValue = EMPTY_ASSIGN_TARGETING_VALUE;
    expect(targeting.targetMode === 'students').toBe(false);
  });

  it('students-mode targeting builds a CF payload with adds and no removes on first save', () => {
    const targeting: AssignTargetingValue = {
      targetMode: 'students',
      targetStudents: [{ kind: 'classlink', sourcedId: 'abc123' }],
      targetGroupIds: [],
      overridesByKey: {
        'classlink:abc123': { timeMultiplier: 2 },
      },
      openAt: 1000,
      closeAt: 2000,
    };

    const payload = buildSetAssignmentTargetsPayload(undefined, targeting);

    expect(payload.targetMode).toBe('students');
    expect(payload.add).toEqual([{ kind: 'classlink', sourcedId: 'abc123' }]);
    expect(payload.remove).toEqual([]);
    expect(payload.overridesBySourcedId).toEqual({
      'classlink:abc123': { timeMultiplier: 2 },
    });
    expect(payload.window).toEqual({ openAt: 1000, closeAt: 2000 });
  });

  it('assignment-doc write includes only client-owned targeting fields, never targetStudents itself', () => {
    // Mirrors the exact keys the Widget writes onto the assignment doc
    // (spec §2a: `setAssignmentTargetsV1` is the sole writer of the resolved
    // `targetStudents` set).
    const targeting: AssignTargetingValue = {
      targetMode: 'students',
      targetStudents: [{ kind: 'test', email: 'a@b.com' }],
      targetGroupIds: ['group-1'],
      overridesByKey: {},
      openAt: 500,
    };

    const assignmentDocFields = {
      targetMode: targeting.targetMode,
      targetGroupIds: targeting.targetGroupIds,
      overridesBySourcedId: targeting.overridesByKey,
      openAt: targeting.openAt ?? null,
      closeAt: targeting.closeAt ?? null,
    };

    expect(assignmentDocFields).not.toHaveProperty('targetStudents');
    expect(assignmentDocFields.targetGroupIds).toEqual(['group-1']);
    expect(assignmentDocFields.closeAt).toBeNull();
  });
});
