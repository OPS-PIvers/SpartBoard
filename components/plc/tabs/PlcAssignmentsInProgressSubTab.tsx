import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader2 } from 'lucide-react';
import type {
  Plc,
  PlcAssignmentTemplate,
  QuizData,
  QuizSessionMode,
  QuizSessionOptions,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcAssignmentIndex } from '@/hooks/usePlcAssignmentIndex';
import { usePlcAssignments } from '@/hooks/usePlcAssignments';
import { useQuiz } from '@/hooks/useQuiz';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import {
  callJoinPlcAssignmentSyncGroup,
  callLeaveSyncedQuizGroup,
  pullSyncedQuizContent,
} from '@/hooks/useSyncedQuizGroups';
import type { SharedAssignmentImportMode } from '@/hooks/useQuizAssignments';
import { logError } from '@/utils/logError';
import { PlcAssignmentImportModal } from '../PlcAssignmentImportModal';
import { PlcAssignmentSessionModal } from '../assignments/PlcAssignmentSessionModal';
import { QuizAssignmentImportSetupModal } from '@/components/quiz/QuizAssignmentImportSetupModal';
import { PlcAssignmentIndexRow } from './PlcAssignmentIndexRow';

interface PlcAssignmentsInProgressSubTabProps {
  plc: Plc;
  /**
   * Optional kind filter. When provided, only index entries whose `kind`
   * matches are shown — used by the Quizzes section's In-progress sub-tab
   * to scope the shared assignment index to quiz rows. Omitted on the
   * standalone Assignments page, where all kinds are shown.
   */
  kindFilter?: 'quiz' | 'video-activity';
}

/**
 * Pending import target for the "Assign to my classes" flow on non-owner
 * rows — mirrors the equivalent state in PlcAssignmentsLibrarySubTab.
 */
interface InProgressImportTarget {
  plcAssignmentId: string;
  syncGroupId: string;
  quizTitle: string;
  sharedByName: string;
  sessionMode: QuizSessionMode;
  sessionOptions: QuizSessionOptions;
  attemptLimit: number | null;
}

/**
 * In-progress sub-tab — assignments at least one PLC member is currently
 * running (status `'active'` or `'paused'`). Status is mirrored
 * fire-and-forget by the source assignment's owner; entries pre-Phase-3
 * lack the field and default to `'active'`, so they surface here until
 * their owner deactivates them.
 *
 * Per-row actions:
 *   - Owner row: Monitor + Results buttons (→ open PlcAssignmentSessionModal
 *     stacked on top of the PLC dashboard)
 *   - Non-owner row: "Assign to my classes" button (→ import the PLC
 *     assignment template onto the viewer's own board)
 */
export const PlcAssignmentsInProgressSubTab: React.FC<
  PlcAssignmentsInProgressSubTabProps
> = ({ plc, kindFilter }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast, rosters } = useDashboard();
  const { entries, loading } = usePlcAssignmentIndex(plc.id);
  // Subscribe to the PLC assignment templates so non-owner rows can match
  // to the template needed for the "Assign to my classes" import flow.
  const { templates, loading: templatesLoading } = usePlcAssignments(plc.id);
  const { saveQuiz, deleteQuiz, attachSyncLinkage, isDriveConnected } = useQuiz(
    user?.uid
  );
  const { assignments, createAssignment, setAssignmentRosters } =
    useQuizAssignments(user?.uid);

  // Monitor/Results modal target — opens PlcAssignmentSessionModal on top of
  // the PLC dashboard for the owner's own quiz assignment.
  const [sessionModal, setSessionModal] = useState<{
    assignmentId: string;
    view: 'monitor' | 'results';
  } | null>(null);

  // Import flow state (mirrors PlcAssignmentsLibrarySubTab).
  const [importTarget, setImportTarget] =
    useState<InProgressImportTarget | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [pendingSetup, setPendingSetup] = useState<{
    id: string;
    quizTitle: string;
  } | null>(null);

  const visible = useMemo(
    () =>
      entries.filter(
        (e) =>
          (e.status === 'active' || e.status === 'paused') &&
          (kindFilter === undefined || e.kind === kindFilter)
      ),
    [entries, kindFilter]
  );

  /**
   * For each in-progress entry, find the matching PLC assignment template
   * by matching ownerUid + title. This is the best available correlation
   * since `PlcAssignmentIndexEntry` doesn't carry a back-reference to the
   * template id (the template id is a separate UUID). If no template is
   * found the "Assign to my classes" button is hidden.
   */
  const templateByEntryId = useMemo(() => {
    const map = new Map<string, PlcAssignmentTemplate>();
    for (const entry of visible) {
      // Heuristic: match by ownerUid + quizTitle (best available correlation).
      // Known limitation: if an owner has two active assignments with the same
      // quiz title, both entries match the first template — ambiguous. A future
      // fix is to store a direct template-id back-reference on PlcAssignmentIndexEntry.
      const match = templates.find(
        (tpl) =>
          tpl.sharedBy === entry.ownerUid && tpl.quizTitle === entry.title
      );
      if (match) map.set(entry.id, match);
    }
    return map;
  }, [visible, templates]);

  const handleMonitor = useCallback((assignmentId: string) => {
    setSessionModal({ assignmentId, view: 'monitor' });
  }, []);

  const handleResults = useCallback((assignmentId: string) => {
    setSessionModal({ assignmentId, view: 'results' });
  }, []);

  const handleImport = useCallback(
    async (
      target: InProgressImportTarget,
      mode: SharedAssignmentImportMode
    ) => {
      if (!user) return;
      if (busyRowId) return;
      if (!isDriveConnected) {
        addToast(
          t('plcDashboard.assignmentsLibrary.driveRequired', {
            defaultValue:
              'Connect Google Drive in your account to pick up PLC assignments.',
          }),
          'error'
        );
        return;
      }

      setImportTarget(null);
      setBusyRowId(target.plcAssignmentId);
      let savedMeta: Awaited<ReturnType<typeof saveQuiz>> | null = null;
      let joinedGroupId: string | null = null;
      let liveVersion: number | undefined;

      try {
        const canonical = await pullSyncedQuizContent(target.syncGroupId);
        const now = Date.now();
        const fresh: QuizData = {
          id: crypto.randomUUID(),
          title: canonical.title,
          // Deep-clone so the saved copy doesn't share question objects with
          // the canonical doc (or the assignment payload built below).
          questions: structuredClone(canonical.questions),
          createdAt: now,
          updatedAt: now,
        };
        savedMeta = await saveQuiz(fresh);

        if (mode === 'sync') {
          const joinResult = await callJoinPlcAssignmentSyncGroup(
            plc.id,
            target.plcAssignmentId
          );
          joinedGroupId = joinResult.groupId;
          liveVersion = Math.max(canonical.version, joinResult.version);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: liveVersion,
          });
        }

        const created = await createAssignment(
          {
            id: savedMeta.id,
            title: savedMeta.title,
            driveFileId: savedMeta.driveFileId,
            questions: canonical.questions,
          },
          {
            sessionMode: target.sessionMode,
            sessionOptions: target.sessionOptions,
            attemptLimit: target.attemptLimit,
          },
          {
            initialStatus: 'paused',
            skipPlcTemplateWrite: true,
            ...(mode === 'sync' && liveVersion !== undefined
              ? {
                  syncedFrom: {
                    groupId: target.syncGroupId,
                    syncedVersion: liveVersion,
                  },
                }
              : {}),
          }
        );

        addToast(
          mode === 'sync'
            ? t('plcDashboard.assignmentsLibrary.importedSync', {
                title: target.quizTitle,
                defaultValue:
                  '"{{title}}" added to your board (paused, synced).',
              })
            : t('plcDashboard.assignmentsLibrary.importedCopy', {
                title: target.quizTitle,
                defaultValue: '"{{title}}" copied to your board (paused).',
              }),
          'success'
        );

        setPendingSetup({ id: created.id, quizTitle: target.quizTitle });
      } catch (err) {
        logError('PlcAssignmentsInProgressSubTab.import', err, {
          plcId: plc.id,
          plcAssignmentId: target.plcAssignmentId,
          mode,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError(
              'PlcAssignmentsInProgressSubTab.import.rollbackLeave',
              leaveErr,
              { plcId: plc.id, groupId: joinedGroupId }
            );
          }
        }
        if (savedMeta) {
          try {
            await deleteQuiz(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError(
              'PlcAssignmentsInProgressSubTab.import.rollbackQuiz',
              rollbackErr,
              { plcId: plc.id, quizId: savedMeta.id }
            );
          }
        }
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.assignmentsLibrary.importFailed', {
                defaultValue: 'Failed to add assignment to your board.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [
      addToast,
      attachSyncLinkage,
      busyRowId,
      createAssignment,
      deleteQuiz,
      isDriveConnected,
      plc.id,
      saveQuiz,
      t,
      user,
    ]
  );

  if (loading || templatesLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <ClipboardList className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">
          {t('plcDashboard.assignmentsInProgress.emptyTitle', {
            defaultValue: 'No assignments in progress',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed">
          {t('plcDashboard.assignmentsInProgress.emptySubtitle', {
            defaultValue:
              'When you or a teammate starts a PLC-mode assignment, it shows up here. Pause or stop it from your board and the row updates live.',
          })}
        </p>
      </div>
    );
  }

  const currentUid = user?.uid;

  // The assignment for the post-import class-period picker. Try the live
  // snapshot first; fall back to the cached title (same pattern as
  // PlcAssignmentsLibrarySubTab) so the modal renders before the listener
  // surfaces the new doc.
  const pendingSetupAssignment = pendingSetup
    ? (assignments.find((a) => a.id === pendingSetup.id) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.assignmentsInProgress.heading', {
            defaultValue: 'Live Across the Team',
          })}
        </h3>
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.assignmentsInProgress.count', {
            count: visible.length,
            defaultValue: '{{count}} running',
            defaultValue_other: '{{count}} running',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {visible.map((entry) => {
          const isOwner = entry.ownerUid === currentUid;
          const template = isOwner
            ? undefined
            : templateByEntryId.get(entry.id);
          return (
            <PlcAssignmentIndexRow
              key={entry.id}
              entry={entry}
              showStatusPill
              onMonitor={
                isOwner && entry.kind === 'quiz'
                  ? () => handleMonitor(entry.id)
                  : undefined
              }
              onResults={
                isOwner && entry.kind === 'quiz'
                  ? () => handleResults(entry.id)
                  : undefined
              }
              onAssignToMyClasses={
                !isOwner && template
                  ? () =>
                      setImportTarget({
                        plcAssignmentId: template.id,
                        syncGroupId: template.syncGroupId,
                        quizTitle: template.quizTitle,
                        sharedByName: template.sharedByName,
                        sessionMode: template.sessionMode,
                        sessionOptions: template.sessionOptions,
                        attemptLimit: template.attemptLimit,
                      })
                  : undefined
              }
              isBusy={!!busyRowId && template?.id === busyRowId}
            />
          );
        })}
      </div>

      {/* Monitor/Results — stacked on top of the PLC dashboard */}
      {sessionModal && (
        <PlcAssignmentSessionModal
          assignmentId={sessionModal.assignmentId}
          view={sessionModal.view}
          onClose={() => setSessionModal(null)}
        />
      )}

      {/* Sync/copy mode picker for "Assign to my classes" */}
      {importTarget && (
        <PlcAssignmentImportModal
          quizTitle={importTarget.quizTitle}
          sharedByName={importTarget.sharedByName}
          onPick={(mode) => void handleImport(importTarget, mode)}
          onClose={() => setImportTarget(null)}
        />
      )}

      {/* Post-import class-period picker */}
      {pendingSetup && pendingSetupAssignment && (
        <QuizAssignmentImportSetupModal
          assignment={pendingSetupAssignment}
          rosters={rosters}
          onSave={async (targets) => {
            await setAssignmentRosters(pendingSetup.id, targets);
            setPendingSetup(null);
          }}
          onClose={() => setPendingSetup(null)}
        />
      )}
    </div>
  );
};
