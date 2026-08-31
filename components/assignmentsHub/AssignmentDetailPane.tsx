// AssignmentDetailPane — per-student status roster (M17 spec §5 D2). Fills the
// detail pane placeholder D1 left behind. Name resolution: teacher-side
// getPseudonymsForAssignmentV1 via useAssignmentPseudonymsMulti. Response
// matching: byStudentUid for quiz/VA/GL, byAssignmentPseudonym for mini-app
// only (useAssignmentPseudonyms.ts contract) — mini-app doesn't need a name
// map keyed by uid since its submissions ARE keyed by the resolved pseudonym.

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Lock } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useAssignmentPseudonymsMulti } from '@/hooks/useAssignmentPseudonyms';
import { useAssignmentRosterStatus } from '@/hooks/useAssignmentRosterStatus';
import {
  useAssignmentDetailActions,
  assignmentRowToTargetingValue,
} from '@/hooks/useAssignmentDetailActions';
import { resolveAssignmentTargets } from '@/utils/resolveAssignmentTargets';
import {
  buildAssignmentRosterRows,
  type AssignmentRosterRow,
} from '@/utils/buildAssignmentRosterRows';
import { AssignTargetingSection } from '@/components/common/library/AssignTargetingSection';
import type { AssignTargetingValue } from '@/utils/studentTargetRef';
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
      {row.removed ? (
        <span className="shrink-0 text-xs font-medium text-slate-400">
          {t('assignmentsHub.detail.removedStatus', {
            defaultValue: 'Removed — work retained',
          })}
        </span>
      ) : row.manual ? (
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
  const { user, orgId } = useAuth();
  const { rosters } = useDashboard();
  const { saveEdit, closeNow } = useAssignmentDetailActions();

  // Edit-in-place (M17 §5 D3). "Adjusting state while rendering" (CLAUDE.md)
  // resets the draft + closes the editor whenever the selected assignment
  // changes, instead of an effect that would cause a redundant extra render.
  const [prevRowId, setPrevRowId] = useState(row.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AssignTargetingValue>(() =>
    assignmentRowToTargetingValue(row)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  if (prevRowId !== row.id) {
    setPrevRowId(row.id);
    setEditing(false);
    setDraft(assignmentRowToTargetingValue(row));
    setSaveError(null);
  }

  const handleSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveEdit(row, user.uid, draft);
      if (result.skipped.length > 0) {
        setSaveError(
          t('assignmentsHub.detail.editSkipped', {
            defaultValue:
              '{{count}} student(s) could not be saved to this assignment.',
            count: result.skipped.length,
          })
        );
      } else {
        setEditing(false);
      }
    } catch {
      setSaveError(
        t('assignmentsHub.detail.editSaveFailed', {
          defaultValue: 'Could not save changes. Try again.',
        })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCloseNow = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await closeNow(row, user.uid);
    } finally {
      setSaving(false);
    }
  };

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
        removedStudentRefs: row.removedStudentRefs,
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
      row.removedStudentRefs,
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
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800 truncate">
            {row.title}
          </h3>
          {!editing && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleCloseNow}
                disabled={
                  saving || (row.closeAt != null && row.closeAt <= Date.now())
                }
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-red-primary transition-colors disabled:opacity-40 disabled:hover:text-slate-500"
              >
                <Lock className="w-3 h-3" aria-hidden="true" />
                {t('assignmentsHub.detail.closeNow', {
                  defaultValue: 'Close now',
                })}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs font-semibold text-brand-blue-dark hover:text-brand-blue-primary transition-colors"
              >
                {t('assignmentsHub.detail.edit', { defaultValue: 'Edit' })}
              </button>
            </div>
          )}
        </div>
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
        {editing && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            <AssignTargetingSection
              rosters={matchedRosters}
              value={draft}
              onChange={setDraft}
              kind={row.kind}
              showDueAt={row.kind === 'quiz'}
            />
            {saveError && (
              <p className="text-xs font-medium text-brand-red-primary">
                {saveError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(assignmentRowToTargetingValue(row));
                  setSaveError(null);
                }}
                disabled={saving}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40"
              >
                {t('assignmentsHub.detail.cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-dark transition-colors disabled:opacity-50"
              >
                {saving
                  ? t('assignmentsHub.detail.saving', {
                      defaultValue: 'Saving…',
                    })
                  : t('assignmentsHub.detail.save', { defaultValue: 'Save' })}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {rosterRows.map((r) => (
          <RosterRow key={r.key} row={r} />
        ))}
      </div>
    </div>
  );
};
