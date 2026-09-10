// AssignmentDetailPane — per-student status roster (M17 spec §5 D2). Fills the
// detail pane placeholder D1 left behind. Name resolution: teacher-side
// getPseudonymsForAssignmentV1 via useAssignmentPseudonymsMulti. Response
// matching: byStudentUid for quiz/VA/GL, byAssignmentPseudonym for mini-app
// only (useAssignmentPseudonyms.ts contract) — mini-app doesn't need a name
// map keyed by uid since its submissions ARE keyed by the resolved pseudonym.

import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { QuizReadAloudManifest } from '@/types';
import { useTranslation } from 'react-i18next';
import { Users, Lock, Users2 } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcs } from '@/hooks/usePlcs';
import { SharePlcResultsModal } from '@/components/widgets/QuizWidget/components/SharePlcResultsModal';
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
import type {
  QuizPlcActions,
  UnifiedAssignmentRow,
} from './useUnifiedAssignments';

const SCHOOLOGY_PREFIX = 'schoology:';

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

export const AssignmentDetailPane: React.FC<{
  row: UnifiedAssignmentRow;
  /** Quiz-only PLC results actions (D12); absent hides the controls. */
  quizPlcActions?: QuizPlcActions;
}> = ({ row, quizPlcActions }) => {
  const { t } = useTranslation();
  const { user, orgId, canAccessFeature } = useAuth();
  const { rosters, addToast } = useDashboard();
  const { saveEdit, closeNow } = useAssignmentDetailActions();
  const { plcs } = usePlcs();
  const [sharePlcOpen, setSharePlcOpen] = useState(false);
  const [plcBusy, setPlcBusy] = useState(false);
  const canSharePlc =
    row.kind === 'quiz' && !!quizPlcActions && plcs.length > 0;

  const handleStopSharingPlc = async () => {
    if (!quizPlcActions || !row.plc) return;
    setPlcBusy(true);
    try {
      await quizPlcActions.stopSharing(row.id);
      addToast(
        t('assignmentsHub.detail.stopSharingPlcDone', {
          defaultValue: 'No longer sharing results with {{plc}}.',
          plc: row.plc.name,
        }),
        'success'
      );
    } catch {
      addToast(
        t('assignmentsHub.detail.plcActionFailed', {
          defaultValue: 'Could not update PLC sharing. Try again.',
        }),
        'error'
      );
    } finally {
      setPlcBusy(false);
    }
  };

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

  // Schoology sections ride the session's `classIds` as `schoology:<contextId>`.
  const schoologyClassIds = useMemo(
    () => (row.classIds ?? []).filter((id) => id.startsWith(SCHOOLOGY_PREFIX)),
    [row.classIds]
  );

  // A section resolves to a SpartBoard class when a roster mirrors its contextId.
  const sections = useMemo(
    () =>
      schoologyClassIds.map((classId) => {
        const contextId = classId.slice(SCHOOLOGY_PREFIX.length);
        const linkedRoster = rosters.find((r) => r.ltiContextId === contextId);
        const title =
          row.classPeriodByClassId?.[classId] ??
          (schoologyClassIds.length === 1 ? row.periodNames?.[0] : undefined);
        return { classId, linkedRoster, title };
      }),
    [schoologyClassIds, rosters, row.classPeriodByClassId, row.periodNames]
  );

  const linkedSectionRosters = useMemo(
    () =>
      sections
        .map((s) => s.linkedRoster)
        .filter((r): r is (typeof rosters)[number] => r !== undefined),
    [sections]
  );

  // Union the linked rosters into the rosterIds path; identical to the plain
  // rosterIds result when no section resolves.
  const effectiveRosterIds = useMemo(() => {
    if (linkedSectionRosters.length === 0) return row.rosterIds;
    return Array.from(
      new Set([
        ...(row.rosterIds ?? []),
        ...linkedSectionRosters.map((r) => r.id),
      ])
    );
  }, [row.rosterIds, linkedSectionRosters]);

  const targeting = useMemo(
    () =>
      resolveAssignmentTargets(
        {
          rosterIds: effectiveRosterIds,
          periodNames: row.periodNames,
          targetMode: row.targetMode,
          targetStudents: row.targetStudents,
        },
        rosters
      ),
    [
      effectiveRosterIds,
      row.periodNames,
      row.targetMode,
      row.targetStudents,
      rosters,
    ]
  );

  const matchedRosters = useMemo(
    () => rosters.filter((r) => (effectiveRosterIds ?? []).includes(r.id)),
    [rosters, effectiveRosterIds]
  );

  // The section ids still gate pseudonym lookups for launches that never
  // resolved to a roster.
  const pseudonymClassIds = useMemo(
    () =>
      schoologyClassIds.length === 0
        ? targeting.classIds
        : Array.from(new Set([...targeting.classIds, ...schoologyClassIds])),
    [targeting.classIds, schoologyClassIds]
  );

  const pseudonyms = useAssignmentPseudonymsMulti(
    row.sessionId,
    pseudonymClassIds,
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

  // Read-aloud manifest status (plan §6.1): only subscribed for quiz rows with the flag on.
  const readAloudAvailable =
    row.kind === 'quiz' && canAccessFeature('quiz-read-aloud');
  const [readAloudStatus, setReadAloudStatus] = useState<
    QuizReadAloudManifest['status'] | null
  >(null);
  useEffect(() => {
    if (!readAloudAvailable) return;
    return onSnapshot(
      doc(db, 'quiz_sessions', row.sessionId),
      (snap) => {
        const manifest = snap.data()?.readAloud as
          | QuizReadAloudManifest
          | undefined;
        setReadAloudStatus(manifest?.status ?? null);
      },
      () => setReadAloudStatus(null)
    );
  }, [readAloudAvailable, row.sessionId]);
  const readAloudLine =
    readAloudStatus === 'preparing'
      ? t('quizReadAloud.preparing', 'Preparing read-aloud…')
      : readAloudStatus === 'partial' || readAloudStatus === 'failed'
        ? t('quizReadAloud.partial', 'Some audio will load on demand.')
        : null;

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

  const isEmptyRoster = rosterRows.length === 0;

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
        {row.kind === 'quiz' && (!!row.plc || canSharePlc) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <Users2
              className="w-3.5 h-3.5 shrink-0 text-brand-blue-primary"
              aria-hidden="true"
            />
            {row.plc ? (
              <>
                <span className="text-slate-600 truncate">
                  {t('assignmentsHub.detail.sharingWithPlc', {
                    defaultValue: 'Sharing results with {{plc}}',
                    plc: row.plc.name,
                  })}
                </span>
                {quizPlcActions && (
                  <button
                    type="button"
                    onClick={() => void handleStopSharingPlc()}
                    disabled={plcBusy}
                    className="shrink-0 font-semibold text-slate-500 hover:text-brand-red-primary transition-colors disabled:opacity-40"
                  >
                    {t('assignmentsHub.detail.stopSharingPlc', {
                      defaultValue: 'Stop sharing',
                    })}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSharePlcOpen(true)}
                className="font-semibold text-brand-blue-dark hover:text-brand-blue-primary transition-colors"
              >
                {t('assignmentsHub.detail.sharePlc', {
                  defaultValue: 'Share results with PLC…',
                })}
              </button>
            )}
          </div>
        )}
        {sharePlcOpen && quizPlcActions && (
          <SharePlcResultsModal
            plcs={plcs}
            assignment={{
              id: row.id,
              quizId: row.quizId ?? '',
              quizTitle: row.title,
              syncGroupId: row.syncGroupId,
            }}
            onClose={() => setSharePlcOpen(false)}
            onConfirm={async (plc, poolSyncGroupId) => {
              await quizPlcActions.share(row.id, { plc, poolSyncGroupId });
              addToast(
                t('assignmentsHub.detail.sharePlcDone', {
                  defaultValue: 'Results now pool with {{plc}}.',
                  plc: plc.name,
                }),
                'success'
              );
              setSharePlcOpen(false);
            }}
          />
        )}
        {sections.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {sections.map((s) => (
              <span key={s.classId} className="text-xs text-slate-500">
                {s.linkedRoster?.name ??
                  s.title ??
                  t('assignmentsHub.detail.schoologySection', {
                    defaultValue: 'Schoology section',
                  })}
                {!s.linkedRoster && (
                  <span className="ml-1 text-slate-400">
                    {t('assignmentsHub.detail.sectionNotLinked', {
                      defaultValue: 'Not linked',
                    })}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
        {readAloudLine && (
          <p className="mt-1 text-xs text-slate-500">{readAloudLine}</p>
        )}
        {!isEmptyRoster && (
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
        )}
        {editing && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
            <AssignTargetingSection
              rosters={matchedRosters}
              value={draft}
              onChange={setDraft}
              kind={row.kind}
              showDueAt={row.kind === 'quiz'}
              readAloudAvailable={readAloudAvailable}
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
        {isEmptyRoster
          ? !editing && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <Users
                    className="h-6 w-6 text-slate-400"
                    aria-hidden="true"
                  />
                </div>
                <p className="max-w-xs text-sm text-slate-600">
                  {t('assignmentsHub.detail.emptyRoster', {
                    defaultValue:
                      'No students are targeted by this assignment yet.',
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md bg-brand-blue-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-blue-dark transition-colors"
                >
                  {t('assignmentsHub.detail.emptyRosterAddStudents', {
                    defaultValue: 'Add students',
                  })}
                </button>
              </div>
            )
          : rosterRows.map((r) => <RosterRow key={r.key} row={r} />)}
      </div>
    </div>
  );
};
