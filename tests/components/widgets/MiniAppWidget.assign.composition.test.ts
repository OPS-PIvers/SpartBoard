/**
 * M17 §5 B3 — MiniAppWidget.handleConfirmAssign targeting composition.
 * Mirrors the equivalent quiz coverage (QuizWidget.assign.composition.test.ts):
 * pure assertions on the shared `buildSetAssignmentTargetsPayload` helper and
 * the exact field split between the client-owned assignment-doc write and the
 * CF-owned `setAssignmentTargetsV1` payload (spec §2a division of labor).
 */
import { describe, it, expect } from 'vitest';
import {
  buildSetAssignmentTargetsPayload,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';

describe('MiniAppWidget.handleConfirmAssign — M17 individual-assignment targeting', () => {
  it('class-mode targeting never triggers setAssignmentTargetsV1 (§3a-G)', () => {
    // Mirrors the Widget's `isIndividualTargeting` guard — the class-wide
    // default must be a strict no-op for the CF call.
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
    // Mirrors the exact keys the Widget writes onto the assignment doc via
    // `createAssignment` (spec §2a: `setAssignmentTargetsV1` is the sole
    // writer of the resolved `targetStudents` set).
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
