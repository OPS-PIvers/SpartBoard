// Builds the Writing assign callable input and its targeting payload from the stepper's state.
import type { ClassRoster, StudentOverride } from '@/types';
import { deriveSessionTargetsFromRosters } from '@/utils/resolveAssignmentTargets';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';
import {
  expandMixedTargeting,
  type AssignClassesValue,
} from '@/utils/assignTargets';
import { dueAtByClassIdFromRosters } from '@/utils/perClassDueDates';

/** What `assignWritingV1` reads (functions/src/writingSessions.ts). */
export interface AssignWritingInput {
  itemId: string;
  classIds: string[];
  periodNames: string[];
  rosterIds: string[];
  openAt: number | null;
  closeAt: number | null;
  dueAt: number | null;
  dueAtByClassId?: Record<string, number>;
  allowPaste: boolean;
  recordingNotice: boolean;
  studentCanViewRecord: boolean;
  spellCheck: boolean;
  timeLimitMinutes?: number;
  tabWarningsEnabled: boolean;
  focusLevel?: 'lock';
  blockPrint?: boolean;
  targetGroupIds?: string[];
  overridesBySourcedId?: Record<string, StudentOverride>;
}

export interface WritingAssignSettings {
  allowPaste: boolean;
  recordingNotice: boolean;
  studentCanViewRecord: boolean;
  spellCheck: boolean;
  timeLimitMinutes: number | null;
  tabWarningsEnabled: boolean;
  focusLevel?: 'lock';
  blockPrint: boolean;
}

export interface WritingAssignSubmission {
  input: AssignWritingInput;
  rosterIds: string[];
  expandedTargeting: AssignTargetingValue;
  studentTargetClassIds: string[];
}

export function buildWritingAssignSubmission(args: {
  itemId: string;
  rosters: ClassRoster[];
  classes: AssignClassesValue;
  targeting: AssignTargetingValue;
  dueAtByRosterId?: Record<string, number>;
  settings: WritingAssignSettings;
}): WritingAssignSubmission {
  const visible = new Set(
    args.rosters.filter((r) => !r.loadError).map((r) => r.id)
  );
  const rosterIds = args.classes.classIds.filter((id) => visible.has(id));
  const selected = args.rosters.filter((r) => rosterIds.includes(r.id));
  const mixed = expandMixedTargeting(
    args.targeting,
    { ...args.classes, classIds: rosterIds },
    args.rosters
  );
  const expanded = mixed.targeting;
  const derived = deriveSessionTargetsFromRosters(selected);
  const perClass =
    args.dueAtByRosterId && Object.keys(args.dueAtByRosterId).length > 0
      ? dueAtByClassIdFromRosters(args.dueAtByRosterId, selected)
      : undefined;
  const s = args.settings;
  return {
    rosterIds,
    expandedTargeting: expanded,
    studentTargetClassIds: mixed.studentTargetClassIds,
    input: {
      itemId: args.itemId,
      classIds: derived.classIds,
      periodNames: derived.periodNames,
      rosterIds: derived.rosterIds,
      openAt: expanded.openAt ?? null,
      closeAt: expanded.closeAt ?? null,
      dueAt: expanded.dueAt ?? null,
      ...(perClass && Object.keys(perClass).length > 0
        ? { dueAtByClassId: perClass }
        : {}),
      allowPaste: s.allowPaste,
      recordingNotice: s.recordingNotice,
      studentCanViewRecord: s.studentCanViewRecord,
      spellCheck: s.spellCheck,
      ...(s.timeLimitMinutes ? { timeLimitMinutes: s.timeLimitMinutes } : {}),
      tabWarningsEnabled: s.tabWarningsEnabled,
      ...(s.focusLevel === 'lock' ? { focusLevel: 'lock' as const } : {}),
      ...(s.blockPrint ? { blockPrint: true } : {}),
      ...(expanded.targetGroupIds.length > 0
        ? { targetGroupIds: expanded.targetGroupIds }
        : {}),
      ...(Object.keys(expanded.overridesByKey).length > 0
        ? { overridesBySourcedId: expanded.overridesByKey }
        : {}),
    },
  };
}
