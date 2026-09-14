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
  /** True for a student removed via the hub (M17 §5 D3) whose submitted work is retained. */
  removed: boolean;
  /** True for a student the teacher skipped: they never received the assignment. */
  skipped: boolean;
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
  /** Refs removed via the hub (M17 §5 D3) — surfaced as a "removed" row only when they have submitted work; otherwise they simply vanish. */
  removedStudentRefs?: StudentTargetRef[];
  /** Refs the teacher skipped — rendered as a distinct "Skipped" row, never counted as not-started. */
  excludedTargets?: StudentTargetRef[];
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
    removedStudentRefs,
    excludedTargets,
    t,
  } = params;

  const excludedKeys = new Set(
    (excludedTargets ?? []).map((ref) => studentTargetRefKey(ref))
  );

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
    const skipped = excludedKeys.has(refKey);
    return {
      key: docId ?? refKey,
      displayName: name,
      // A skipped student never received the assignment, so they carry no
      // status at all rather than a misleading "not started".
      status: skipped
        ? null
        : docId
          ? (statusByUid.get(docId) ?? 'not-started')
          : 'not-started',
      manual: false,
      modifiedNote: skipped
        ? null
        : studentOverrideModifiedNote(override, totalQuestions, t),
      removed: false,
      skipped,
    };
  };

  const rows: AssignmentRosterRow[] = [];
  const renderedRefKeys = new Set<string>();

  if (targetMode === 'students') {
    for (const ref of targetStudents) {
      renderedRefKeys.add(studentTargetRefKey(ref));
      rows.push(rowForRef(ref, unresolvedLabel));
    }
  } else {
    for (const roster of matchedRosters) {
      for (const student of roster.students) {
        const ref = resolveStudentTargetRef(student, roster);
        if (ref) renderedRefKeys.add(studentTargetRefKey(ref));
        const fallbackName = `${student.firstName} ${student.lastName}`.trim();
        if (!ref) {
          rows.push({
            key: `manual:${roster.id}:${student.id}`,
            displayName: fallbackName,
            status: null,
            manual: true,
            modifiedNote: null,
            removed: false,
            skipped: false,
          });
          continue;
        }
        rows.push(rowForRef(ref, fallbackName));
      }
    }
  }

  // Removed-but-submitted rows (M17 §5 D3, Decision 17): a student removed
  // from targeting still shows up here if they have submitted work, so the
  // teacher never loses sight of a graded response. A removed ref with no
  // submission simply never appears — it was never targeted from the
  // student's perspective once the pointer doc was deleted.
  // Class mode already renders every roster student, so a removed ref that is
  // still on the roster would otherwise appear twice, the second time
  // mislabelled "Removed".
  const currentKeys = new Set([
    ...targetStudents.map((ref) => studentTargetRefKey(ref)),
    ...renderedRefKeys,
  ]);
  for (const ref of removedStudentRefs ?? []) {
    const refKey = studentTargetRefKey(ref);
    if (currentKeys.has(refKey)) continue; // re-added since removal
    const docId = docIdByRefKey.get(refKey);
    const status = docId ? statusByUid.get(docId) : undefined;
    if (
      !docId ||
      status == null ||
      (status !== 'submitted' && status !== 'graded')
    ) {
      continue;
    }
    const name = formatStudentName(nameByDocId.get(docId)) || unresolvedLabel;
    rows.push({
      key: docId,
      displayName: name,
      status,
      manual: false,
      modifiedNote: null,
      removed: true,
      skipped: false,
    });
  }

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
