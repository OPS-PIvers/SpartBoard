/**
 * buildAssignmentRosterRows — pure row-building for the Assignments hub
 * detail pane (M17 spec §5 D2). Kept separate from the component so status
 * derivation, name resolution, and the "modified"/manual-row states are
 * unit-testable without rendering.
 */

import type { TFunction } from 'i18next';
import type { ClassRoster, StudentOverride, StudentTargetRef } from '@/types';
import type { AssignmentStudentStatus } from '@/components/assignmentsHub/AssignmentStatusChip';
import type { AssignmentKind } from '@/components/assignmentsHub/useUnifiedAssignments';
import type { AssignmentPseudonymMaps } from '@/hooks/useAssignmentPseudonyms';
import { formatStudentName } from '@/hooks/useAssignmentPseudonyms';
import {
  resolveStudentTargetRef,
  studentTargetRefKey,
} from '@/utils/studentTargetRef';
import { studentOverrideModifiedNote } from '@/utils/studentOverrideModifiedNote';

export interface AssignmentRosterRow {
  /** Stable row key: studentUid when resolved, else the target-ref key or roster student id. */
  key: string;
  displayName: string;
  /** null for manually-created (PIN/no-SSO) students — they have no fan-out status. */
  status: AssignmentStudentStatus | null;
  manual: boolean;
  modifiedNote: string | null;
}

export function buildAssignmentRosterRows(params: {
  kind: AssignmentKind;
  targetMode: 'class' | 'students';
  targetStudents: StudentTargetRef[];
  /** Rosters resolved from the assignment's `rosterIds` (class mode only). */
  matchedRosters: ClassRoster[];
  overridesBySourcedId: Record<string, StudentOverride> | undefined;
  totalQuestions: number | null;
  pseudonyms: AssignmentPseudonymMaps;
  /** Response/submission doc id -> status. Mini-app doc ids are assignmentPseudonyms; all other kinds are studentUids (spec's `useAssignmentPseudonyms.ts:5-13` contract). */
  statusByUid: Map<string, AssignmentStudentStatus>;
  t: TFunction;
}): AssignmentRosterRow[] {
  const {
    kind,
    targetMode,
    targetStudents,
    matchedRosters,
    overridesBySourcedId,
    totalQuestions,
    pseudonyms,
    statusByUid,
    t,
  } = params;

  // Mini-app submissions are keyed by `assignmentPseudonym`, not `studentUid`
  // (useAssignmentPseudonyms.ts:5-13) — join through the pseudonym-keyed
  // reverse map instead of the studentUid one for this kind only.
  const isMiniApp = kind === 'mini-app';
  const docIdByRefKey = new Map<string, string>();
  const reverseMap = isMiniApp
    ? pseudonyms.targetRefKeyByAssignmentPseudonym
    : pseudonyms.targetRefKeyByStudentUid;
  for (const [docId, key] of reverseMap) {
    docIdByRefKey.set(key, docId);
  }
  const nameByDocId = isMiniApp
    ? pseudonyms.byAssignmentPseudonym
    : pseudonyms.byStudentUid;

  const unresolvedLabel = t('assignmentsHub.detail.unresolvedStudent', {
    defaultValue: 'Student',
  });

  const rowForRef = (
    ref: StudentTargetRef,
    fallbackName: string
  ): AssignmentRosterRow => {
    const refKey = studentTargetRefKey(ref);
    const docId = docIdByRefKey.get(refKey);
    const name = docId
      ? formatStudentName(nameByDocId.get(docId)) || fallbackName
      : fallbackName;
    const override = overridesBySourcedId?.[refKey];
    return {
      key: docId ?? refKey,
      displayName: name,
      status: docId ? (statusByUid.get(docId) ?? 'not-started') : 'not-started',
      manual: false,
      modifiedNote: studentOverrideModifiedNote(override, totalQuestions, t),
    };
  };

  const rows: AssignmentRosterRow[] = [];

  if (targetMode === 'students') {
    for (const ref of targetStudents) {
      rows.push(rowForRef(ref, unresolvedLabel));
    }
  } else {
    for (const roster of matchedRosters) {
      for (const student of roster.students) {
        const ref = resolveStudentTargetRef(student, roster);
        const fallbackName = `${student.firstName} ${student.lastName}`.trim();
        if (!ref) {
          rows.push({
            key: `manual:${roster.id}:${student.id}`,
            displayName: fallbackName,
            status: null,
            manual: true,
            modifiedNote: null,
          });
          continue;
        }
        rows.push(rowForRef(ref, fallbackName));
      }
    }
  }

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
