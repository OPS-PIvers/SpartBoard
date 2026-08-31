// AssignmentDetailPane — per-student status roster (M17 spec §5 D2). Fills the
// detail pane placeholder D1 left behind. Name resolution: teacher-side
// getPseudonymsForAssignmentV1 via useAssignmentPseudonymsMulti. Response
// matching: byStudentUid for quiz/VA/GL, byAssignmentPseudonym for mini-app
// only (useAssignmentPseudonyms.ts contract) — mini-app doesn't need a name
// map keyed by uid since its submissions ARE keyed by the resolved pseudonym.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useAssignmentRosterStatus } from '@/hooks/useAssignmentRosterStatus';
import { resolveAssignmentTargets } from '@/utils/resolveAssignmentTargets';
import {
  buildAssignmentRosterRows,
  type AssignmentRosterRow,
} from '@/utils/buildAssignmentRosterRows';
import { AssignmentStatusChip } from './AssignmentStatusChip';
import type { UnifiedAssignmentRow } from './useUnifiedAssignments';

const STATUS_ORDER = [
  'not-started',
  'in-progress',
  'submitted',
  'graded',
] as const;

const RosterRow: React.FC<{ row: AssignmentRosterRow }> = ({ row }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-50">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">
          {row.displayName}
        </p>
        {row.modifiedNote && (
          <p className="text-xs text-slate-400">{row.modifiedNote}</p>
        )}
      </div>
      {row.manual ? (
        <span className="shrink-0 text-xs text-slate-400">
          {t('assignmentsHub.detail.manualStatus', {
            defaultValue: 'PIN/manual — no SSO status',
          })}
        </span>
      ) : (
        <AssignmentStatusChip status={row.status ?? 'not-started'} />
      )}
    </div>
  );
};

export const AssignmentDetailPane: React.FC<{ row: UnifiedAssignmentRow }> = ({
  row,
}) => {
  const { t } = useTranslation();
  const { orgId } = useAuth();
  const { rosters } = useDashboard();

  const targeting = useMemo(
    () =>
      resolveAssignmentTargets(
        {
          rosterIds: row.rosterIds,
          periodNames: row.periodNames,
          targetMode: row.targetMode,
          targetStudents: row.targetStudents,
        },
        rosters
      ),
    [
      row.rosterIds,
      row.periodNames,
      row.targetMode,
      row.targetStudents,
      rosters,
    ]
  );

  const matchedRosters = useMemo(
    () => rosters.filter((r) => (row.rosterIds ?? []).includes(r.id)),
    [rosters, row.rosterIds]
  );

  const pseudonyms = useAssignmentPseudonymsMulti(
    row.sessionId,
    targeting.classIds,
    orgId,
    row.targetMode === 'students' ? row.targetStudents : undefined
  );

  const { statusByUid, totalQuestions, loading } = useAssignmentRosterStatus(
    row.kind,
    row.sessionId
  );

  const rosterRows = useMemo(
    () =>
      buildAssignmentRosterRows({
        kind: row.kind,
        targetMode: row.targetMode,
        targetStudents: row.targetStudents ?? [],
        matchedRosters,
        overridesBySourcedId: row.overridesBySourcedId,
        totalQuestions,
        pseudonyms,
        statusByUid,
        t,
      }),
    [
      row.kind,
      row.targetMode,
      row.targetStudents,
      matchedRosters,
      row.overridesBySourcedId,
      totalQuestions,
      pseudonyms,
      statusByUid,
      t,
    ]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      'not-started': 0,
      'in-progress': 0,
      submitted: 0,
      graded: 0,
      manual: 0,
    };
    for (const r of rosterRows) {
      if (r.manual) c.manual += 1;
      else c[r.status ?? 'not-started'] += 1;
    }
    return c;
  }, [rosterRows]);

  if (loading) {
    return (
      <div className="w-full h-full p-4 space-y-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (rosterRows.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
          <Users className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="max-w-xs text-sm text-slate-600">
          {t('assignmentsHub.detail.emptyRoster', {
            defaultValue: 'No students are targeted by this assignment yet.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800 truncate">
          {row.title}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {STATUS_ORDER.map((status) => (
            <span
              key={status}
              className="inline-flex items-center gap-1 text-xs text-slate-500"
            >
              <AssignmentStatusChip status={status} />
              <span>{counts[status]}</span>
            </span>
          ))}
          {counts.manual > 0 && (
            <span className="text-xs text-slate-400">
              {t('assignmentsHub.detail.manualCount', {
                defaultValue: '{{count}} manual',
                count: counts.manual,
              })}
            </span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {rosterRows.map((r) => (
          <RosterRow key={r.key} row={r} />
        ))}
      </div>
    </div>
  );
};
