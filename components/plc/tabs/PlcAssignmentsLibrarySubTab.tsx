/**
 * PlcAssignmentsLibrarySubTab — Phase 3.
 *
 * Lists every assignment template any PLC member has authored. Each row
 * supports:
 *
 *   - "Add to my board" — opens `PlcAssignmentImportModal` (sync-or-copy
 *     picker). On Sync we pull the canonical content, save a fresh
 *     personal copy of the source quiz, join the canonical synced group
 *     via Cloud Function, and create a new (paused) personal assignment
 *     using the template's `sessionMode` / `sessionOptions` /
 *     `attemptLimit`. On Copy we pull canonical + save without joining
 *     the sync group, then create a paused assignment with the same
 *     settings. The new assignment is paused so the importer can pick
 *     rosters before going live.
 *
 *     The pickup explicitly passes `skipPlcTemplateWrite: true` to
 *     `createAssignment` so it doesn't recursively author another
 *     template — picking up an existing template should not turn into
 *     a new template.
 *
 *   - "Unshare" — any current member can remove a template (PLC-owned
 *     model — assignment templates belong to the PLC, not the original
 *     sharer). Already-imported personal assignments on teammates'
 *     boards keep running (orphan-tolerant per Phase 3 spec).
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList,
  Download,
  ExternalLink,
  Loader2,
  PlayCircle,
  Plus,
  Trash2,
  Users2,
} from 'lucide-react';
import type {
  Plc,
  QuizAssignment,
  QuizData,
  QuizSessionMode,
  QuizSessionOptions,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
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
import { QuizAssignmentImportSetupModal } from '@/components/quiz/QuizAssignmentImportSetupModal';

interface PlcAssignmentsLibrarySubTabProps {
  plc: Plc;
  /**
   * Closes the PLC dashboard overlay. Invoked when the post-import
   * "Edit all settings…" link is clicked so the teacher can be handed
   * off to the QuizWidget's full assignment editor without the PLC
   * dashboard staying open behind it.
   */
  onCloseDashboard: () => void;
  /**
   * Open the parent body's "+ Assign Quiz" wizard. Surfaced from the
   * empty-state CTA so a brand-new PLC isn't a dead end — the teacher
   * can author the first PLC assignment without leaving the tab. The
   * populated-state CTAs live on the body's header row, so the
   * sub-tab's own header doesn't double up.
   */
  onNewQuizAssignment?: () => void;
  /** Mirror of `onNewQuizAssignment` for the video-activity wizard. */
  onNewVideoActivityAssignment?: () => void;
}

interface ImportTarget {
  plcAssignmentId: string;
  syncGroupId: string;
  quizTitle: string;
  sharedByName: string;
  sessionMode: QuizSessionMode;
  sessionOptions: QuizSessionOptions;
  attemptLimit: number | null;
}

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export const PlcAssignmentsLibrarySubTab: React.FC<
  PlcAssignmentsLibrarySubTabProps
> = ({
  plc,
  onCloseDashboard,
  onNewQuizAssignment,
  onNewVideoActivityAssignment,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast, rosters, setPendingAssignmentEdit } = useDashboard();
  const { showConfirm } = useDialog();
  const { templates, loading, deleteAssignmentTemplate } = usePlcAssignments(
    plc.id
  );
  const { saveQuiz, deleteQuiz, attachSyncLinkage, isDriveConnected } = useQuiz(
    user?.uid
  );
  const { assignments, createAssignment, setAssignmentRosters } =
    useQuizAssignments(user?.uid);

  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  // Tracks the freshly-imported assignment that still needs class-period
  // targeting. Holds enough data to render the picker before the
  // assignments snapshot surfaces the new doc (snapshot lag would
  // otherwise drop the prompt silently — the assignment is already
  // created in Firestore, so `setAssignmentRosters` works against the id
  // regardless of local listener state).
  const [pendingSetup, setPendingSetup] = useState<{
    id: string;
    quizTitle: string;
  } | null>(null);

  const handleImport = useCallback(
    async (target: ImportTarget, mode: SharedAssignmentImportMode) => {
      if (!user) return;
      // Block parallel imports across rows. Without this, two rapid
      // clicks on different templates race; whichever createAssignment
      // resolves second wins setPendingSetup and the first import's
      // class-period picker is silently dropped.
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
      // Hoisted to function scope so the `syncedFrom` block below can
      // tag the new personal assignment with the same version that
      // `attachSyncLinkage` saw — prevents a stale-by-zero "Sync
      // available" prompt on a card that's actually current. `Math.max`
      // here guards against a peer publish landing between the
      // canonical pull and the Cloud-Function join, which would leave
      // `joinResult.version` higher than `canonical.version`.
      let liveVersion: number | undefined;
      try {
        const canonical = await pullSyncedQuizContent(target.syncGroupId);
        const now = Date.now();
        const fresh: QuizData = {
          id: crypto.randomUUID(),
          title: canonical.title,
          questions: canonical.questions,
          createdAt: now,
          updatedAt: now,
        };
        savedMeta = await saveQuiz(fresh);
        if (mode === 'sync') {
          // Server-side participant write must precede the client-side
          // attachSyncLinkage so a later editor save doesn't try to
          // publish from a non-participant context.
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

        // Create the paused personal assignment with the template's
        // session settings. `skipPlcTemplateWrite: true` so picking up an
        // existing template doesn't recursively author a new template.
        // PLC linkage is intentionally NOT set here — the importer can
        // toggle "Share with PLC" via the assignment settings modal post-
        // import if they want results to flow into the PLC's sheet.
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

        // Chain straight into the class-period picker so teachers don't
        // forget to assign this quiz to their classes. Without this they
        // had to dig into the QuizWidget's per-assignment settings to set
        // periods, and most never did — leaving the quiz unassignable.
        // Cache title here so the modal can render before the assignments
        // snapshot surfaces the new doc.
        setPendingSetup({ id: created.id, quizTitle: target.quizTitle });
      } catch (err) {
        logError('PlcAssignmentsLibrarySubTab.import', err, {
          plcId: plc.id,
          plcAssignmentId: target.plcAssignmentId,
          mode,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError(
              'PlcAssignmentsLibrarySubTab.import.rollbackLeave',
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
              'PlcAssignmentsLibrarySubTab.import.rollbackQuiz',
              rollbackErr,
              {
                plcId: plc.id,
                quizId: savedMeta.id,
                driveFileId: savedMeta.driveFileId,
              }
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

  const handleUnshare = useCallback(
    async (plcAssignmentId: string, title: string) => {
      const confirmed = await showConfirm(
        t('plcDashboard.assignmentsLibrary.unshareConfirm', {
          title,
          defaultValue:
            'Remove "{{title}}" from this PLC? Teammates who have already added it to their board keep their copy.',
        }),
        {
          title: t('plcDashboard.assignmentsLibrary.unshareTitle', {
            defaultValue: 'Unshare assignment template',
          }),
          variant: 'warning',
          confirmLabel: t('plcDashboard.assignmentsLibrary.unshareAction', {
            defaultValue: 'Unshare',
          }),
        }
      );
      if (!confirmed) return;
      setBusyRowId(plcAssignmentId);
      try {
        await deleteAssignmentTemplate(plcAssignmentId);
        addToast(
          t('plcDashboard.assignmentsLibrary.unshared', {
            title,
            defaultValue: '"{{title}}" removed from this PLC.',
          }),
          'success'
        );
      } catch (err) {
        logError('PlcAssignmentsLibrarySubTab.unshare', err, {
          plcId: plc.id,
          plcAssignmentId,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.assignmentsLibrary.unshareFailed', {
                defaultValue: 'Failed to unshare assignment template.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, deleteAssignmentTemplate, plc.id, showConfirm, t]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
          <ClipboardList className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-2">
          {t('plcDashboard.assignmentsLibrary.emptyTitle', {
            defaultValue: 'No assignment templates yet',
          })}
        </h3>
        <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-5">
          {t('plcDashboard.assignmentsLibrary.emptySubtitle', {
            defaultValue:
              'Toggle "Share with PLC" on any quiz assignment you create — it\'ll show up here so teammates can pick it up onto their own boards.',
          })}
        </p>
        {(onNewQuizAssignment ?? onNewVideoActivityAssignment) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onNewQuizAssignment && (
              <button
                type="button"
                onClick={onNewQuizAssignment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {t('plcDashboard.newAssignment.quiz.ctaLabel', {
                  defaultValue: 'Assign Quiz',
                })}
              </button>
            )}
            {onNewVideoActivityAssignment && (
              <button
                type="button"
                onClick={onNewVideoActivityAssignment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors"
              >
                <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
                {t('plcDashboard.newAssignment.video.ctaLabel', {
                  defaultValue: 'Assign Video',
                })}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.assignmentsLibrary.heading', {
            defaultValue: 'Assignment Templates',
          })}
        </h3>
        <span className="text-xxs text-slate-400">
          {t('plcDashboard.assignmentsLibrary.count', {
            count: templates.length,
            defaultValue: '{{count}} template',
            defaultValue_other: '{{count}} templates',
          })}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {templates.map((template) => {
          const ownerLabel =
            template.sharedByName?.trim() ||
            template.sharedByEmail ||
            t('plcDashboard.assignmentsLibrary.unknownSharer', {
              defaultValue: 'a teammate',
            });
          const isBusy = busyRowId === template.id;
          // Disable every row's add/unshare actions while any import is
          // in flight OR while the post-import class-period picker is open.
          // Without the pendingSetup guard a teacher could click a second
          // "Add to my board" while the picker is still showing; the second
          // import's setPendingSetup call would silently replace the picker
          // and leave the first assignment unassigned.
          const anyImportBusy = busyRowId !== null || pendingSetup !== null;
          return (
            <div
              key={template.id}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-brand-blue-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 truncate">
                  {template.quizTitle}
                </div>
                <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="truncate flex items-center gap-1">
                    <Users2 className="w-3 h-3" />
                    {t('plcDashboard.assignmentsLibrary.bySharer', {
                      name: ownerLabel,
                      defaultValue: 'shared by {{name}}',
                    })}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="uppercase tracking-wider font-bold text-slate-400">
                    {template.sessionMode}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span>{formatDate(template.updatedAt)}</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setImportTarget({
                      plcAssignmentId: template.id,
                      syncGroupId: template.syncGroupId,
                      quizTitle: template.quizTitle,
                      sharedByName: template.sharedByName,
                      sessionMode: template.sessionMode,
                      sessionOptions: template.sessionOptions,
                      attemptLimit: template.attemptLimit,
                    })
                  }
                  disabled={anyImportBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  title={t('plcDashboard.assignmentsLibrary.addToMyBoard', {
                    defaultValue: 'Add to my board',
                  })}
                >
                  {isBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  <span className="hidden sm:inline">
                    {t('plcDashboard.assignmentsLibrary.addToMyBoard', {
                      defaultValue: 'Add to my board',
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleUnshare(template.id, template.quizTitle)
                  }
                  disabled={anyImportBusy}
                  aria-label={t(
                    'plcDashboard.assignmentsLibrary.unshareAction',
                    {
                      defaultValue: 'Unshare',
                    }
                  )}
                  title={t('plcDashboard.assignmentsLibrary.unshareTooltip', {
                    defaultValue:
                      'Remove from PLC (any member can unshare; existing imports keep working)',
                  })}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!isDriveConnected && (
        <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <ExternalLink className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">
            {t('plcDashboard.assignmentsLibrary.driveDisconnected', {
              defaultValue:
                'Connect Google Drive to pick up PLC assignments onto your board.',
            })}
          </p>
        </div>
      )}
      {importTarget && (
        <PlcAssignmentImportModal
          quizTitle={importTarget.quizTitle}
          sharedByName={importTarget.sharedByName}
          onPick={(mode) => void handleImport(importTarget, mode)}
          onClose={() => setImportTarget(null)}
        />
      )}
      {pendingSetup &&
        (() => {
          // Prefer the live snapshot's assignment record once available
          // (carries more accurate metadata, e.g. PLC-corrected title)
          // but fall back to the stub built from import-time data so a
          // slow Firestore snapshot doesn't drop the prompt. The id is
          // authoritative either way; `setAssignmentRosters` writes
          // against it directly and doesn't depend on local listener
          // state.
          const live = assignments.find((a) => a.id === pendingSetup.id);
          const stub = {
            id: pendingSetup.id,
            quizTitle: pendingSetup.quizTitle,
          } as unknown as QuizAssignment;
          return (
            <QuizAssignmentImportSetupModal
              assignment={live ?? stub}
              rosters={rosters}
              onSave={async (targets) => {
                try {
                  await setAssignmentRosters(pendingSetup.id, targets);
                  addToast(
                    t('plcDashboard.assignmentsLibrary.assignedToClasses', {
                      count: targets.rosterIds.length,
                      defaultValue: 'Assigned to {{count}} class.',
                      defaultValue_other: 'Assigned to {{count}} classes.',
                    }),
                    'success'
                  );
                } catch (err) {
                  addToast(
                    err instanceof Error
                      ? err.message
                      : t('plcDashboard.assignmentsLibrary.assignFailed', {
                          defaultValue: 'Failed to save class selection.',
                        }),
                    'error'
                  );
                  throw err;
                }
              }}
              onEditAllSettings={() => {
                // Hand off to the QuizWidget's full settings editor.
                // The PLC dashboard closes first so the editor isn't
                // buried under the dashboard overlay; the QuizWidget
                // picks up `pendingAssignmentEditId` from context and
                // opens `editingAssignment` once its snapshot surfaces
                // the same doc.
                setPendingAssignmentEdit(pendingSetup.id);
                setPendingSetup(null);
                onCloseDashboard();
              }}
              onClose={() => setPendingSetup(null)}
            />
          );
        })()}
    </div>
  );
};
