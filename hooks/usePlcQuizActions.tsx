// Shared-quiz actions (import / assign / edit / versions / share) for the PLC assessment list.

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Plc,
  QuizAssignment,
  QuizBehaviorSettings,
  QuizData,
  QuizMetadata,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcQuizzes, writePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import { SyncedQuizVersionConflictError, useQuiz } from '@/hooks/useQuiz';
import {
  callJoinPlcQuizSyncGroup,
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
  pullSyncedQuizContent,
  useSyncedQuizGroupsByIds,
} from '@/hooks/useSyncedQuizGroups';
import { usePlcAutoPullSync } from '@/hooks/usePlcAutoPullSync';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { SharedAssignmentImportMode } from '@/hooks/useQuizAssignments';
import { logError } from '@/utils/logError';
import { canEditPlcContent, getPlcMemberEmail } from '@/utils/plc';
import { buildPlcLinkage } from '@/utils/plcLinkage';
import { DEFAULT_QUIZ_BEHAVIOR, getQuizBehavior } from '@/utils/quizBehavior';
import { PlcVersionHistoryPanel } from '@/components/plc/versions/PlcVersionHistoryPanel';
import { PlcSyncConflictPrompt } from '@/components/plc/sync/PlcSyncConflictPrompt';
import { PlcAssignmentImportModal } from '@/components/plc/PlcAssignmentImportModal';
import { PlcQuizImportModal } from '@/components/plc/PlcQuizImportModal';
import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from '@/components/plc/PlcSharePickerModal';
import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import { QuizAssignmentImportSetupModal } from '@/components/quiz/QuizAssignmentImportSetupModal';

/** The slice of an assessment row these actions need. */
export interface PlcQuizActionTarget {
  plcQuizId: string;
  syncGroupId: string;
  title: string;
  sharedByName: string | null;
}

export interface PlcQuizActionsApi {
  /** Opens the sync-or-copy picker; also the re-import entry point. */
  importQuiz: (target: PlcQuizActionTarget) => void;
  reimportQuiz: (target: PlcQuizActionTarget) => void;
  assignQuiz: (target: PlcQuizActionTarget) => void;
  editQuiz: (target: PlcQuizActionTarget) => void;
  openVersionHistory: (target: PlcQuizActionTarget) => void;
  openSharePicker: () => void;
  busyRowId: string | null;
  /** True while an import/assign is mid-flight or the class picker is open. */
  busy: boolean;
  isDriveConnected: boolean;
  isInLibrary: (syncGroupId: string) => boolean;
  modals: React.ReactNode;
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

export function usePlcQuizActions(
  plc: Plc,
  onCloseDashboard: () => void
): PlcQuizActionsApi {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast, rosters, setPendingAssignmentEdit } = useDashboard();
  const { quizzes: plcQuizzes, mirrorPlcQuizHeader } = usePlcQuizzes(plc.id);
  const {
    quizzes: personalQuizzes,
    saveQuiz,
    deleteQuiz,
    attachSyncLinkage,
    loadQuizData,
    pullSyncedQuiz,
    isDriveConnected,
  } = useQuiz(user?.uid);

  const [importTarget, setImportTarget] = useState<PlcQuizActionTarget | null>(
    null
  );
  const [assignTarget, setAssignTarget] = useState<PlcQuizActionTarget | null>(
    null
  );
  const [versionTarget, setVersionTarget] = useState<{
    syncGroupId: string;
    title: string;
  } | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    quiz: QuizData;
    meta: QuizMetadata;
  } | null>(null);
  const [savingReplicaId, setSavingReplicaId] = useState<string | null>(null);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [pendingSetup, setPendingSetup] = useState<{
    id: string;
    quizTitle: string;
  } | null>(null);

  // Cost guard: only subscribe to quiz_assignments while an assign is live.
  const { assignments, createAssignment, setAssignmentRosters } =
    useQuizAssignments(assignTarget || pendingSetup ? user?.uid : undefined);

  const canEdit = useMemo(
    () => (user ? canEditPlcContent(plc, user.uid) : false),
    [plc, user]
  );

  const entryById = useMemo(
    () => new Map(plcQuizzes.map((q) => [q.id, q])),
    [plcQuizzes]
  );

  const personalBySyncGroup = useMemo(() => {
    const map = new Map<string, QuizMetadata>();
    for (const q of personalQuizzes) {
      if (q.sync?.groupId) map.set(q.sync.groupId, q);
    }
    return map;
  }, [personalQuizzes]);

  const plcSyncGroupIds = useMemo(
    () => new Set(plcQuizzes.map((q) => q.syncGroupId)),
    [plcQuizzes]
  );

  const syncedReplicas = useMemo(
    () =>
      personalQuizzes.filter(
        (q) => q.sync?.groupId && plcSyncGroupIds.has(q.sync.groupId)
      ),
    [personalQuizzes, plcSyncGroupIds]
  );
  const syncedReplicaGroupIds = useMemo(
    () =>
      syncedReplicas
        .map((q) => q.sync?.groupId)
        .filter((id): id is string => !!id),
    [syncedReplicas]
  );
  const { groups: canonicalGroups } = useSyncedQuizGroupsByIds(
    syncedReplicaGroupIds
  );
  const dirtyReplicaId = editing?.meta.id ?? null;
  const { conflicts, resolveConflict } = usePlcAutoPullSync<QuizMetadata>({
    replicas: syncedReplicas,
    canonicalGroups,
    dirtyReplicaId,
    suspendedReplicaId: savingReplicaId,
    enabled: canEdit && isDriveConnected,
    pull: pullSyncedQuiz,
    acknowledgeVersion: (replica, canonicalVersion) => {
      if (!replica.sync) return Promise.resolve();
      return attachSyncLinkage(replica.id, {
        groupId: replica.sync.groupId,
        lastSyncedVersion: canonicalVersion,
      });
    },
    onAutoPulled: (replica) =>
      addToast(
        t('plcDashboard.sync.autoPulled', {
          title: replica.title,
          defaultValue:
            '"{{title}}" updated to your teammate’s latest version.',
        }),
        'info'
      ),
    onAutoPullError: (replica) =>
      addToast(
        t('plcDashboard.sync.autoPullFailed', {
          title: replica.title,
          defaultValue:
            'Couldn’t pull the latest version of "{{title}}". We’ll retry on the next update.',
        }),
        'error'
      ),
    onConflictPulled: (replica) =>
      addToast(
        t('plcDashboard.sync.pulledTheirs', {
          title: replica.title,
          defaultValue:
            'Pulled your teammate’s version of "{{title}}". Your unsaved edits were discarded.',
        }),
        'info'
      ),
    onConflictKept: (replica) =>
      addToast(
        t('plcDashboard.sync.keptMine', {
          title: replica.title,
          defaultValue:
            'Kept your edits to "{{title}}". You can publish them to share with your team.',
        }),
        'info'
      ),
    onError: (replica, err) =>
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.sync.resolveFailed', {
              title: replica.title,
              defaultValue:
                'Couldn’t resolve the sync conflict for "{{title}}". Try again.',
            }),
        'error'
      ),
  });

  const sharePickerItems = useMemo<PlcSharePickerItem[]>(
    () =>
      personalQuizzes
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((meta) => ({
          id: meta.id,
          title: meta.title,
          metaLine: t('plcDashboard.quizLibrary.sharePicker.itemMeta', {
            count: meta.questionCount,
            date: formatDate(meta.updatedAt),
            defaultValue: '{{count}} question · {{date}}',
            defaultValue_other: '{{count}} questions · {{date}}',
          }),
          alreadyShared: meta.sync?.groupId
            ? plcSyncGroupIds.has(meta.sync.groupId)
            : false,
        })),
    [personalQuizzes, plcSyncGroupIds, t]
  );

  const handleImport = useCallback(
    async (target: PlcQuizActionTarget, mode: SharedAssignmentImportMode) => {
      if (!user) return;
      if (busyRowId) return;
      if (!isDriveConnected) {
        addToast(
          t('plcDashboard.quizLibrary.driveRequired', {
            defaultValue:
              'Connect Google Drive in your account to import PLC quizzes.',
          }),
          'error'
        );
        return;
      }

      if (mode === 'sync' && personalBySyncGroup.has(target.syncGroupId)) {
        setImportTarget(null);
        addToast(
          t('plcDashboard.quizLibrary.alreadySynced', {
            title: target.title,
            defaultValue: '"{{title}}" is already synced to your library.',
          }),
          'info'
        );
        return;
      }

      setImportTarget(null);
      setBusyRowId(target.plcQuizId);
      let savedMeta: Awaited<ReturnType<typeof saveQuiz>> | null = null;
      let joinedGroupId: string | null = null;
      try {
        const canonical = await pullSyncedQuizContent(target.syncGroupId);
        const now = Date.now();
        const fresh: QuizData = {
          id: crypto.randomUUID(),
          title: canonical.title,
          questions: canonical.questions,
          ...(canonical.stimuli && canonical.stimuli.length > 0
            ? { stimuli: canonical.stimuli }
            : {}),
          ...(canonical.language ? { language: canonical.language } : {}),
          createdAt: now,
          updatedAt: now,
        };
        savedMeta = await saveQuiz(fresh, undefined, canonical.behavior);
        if (mode === 'sync') {
          const joinResult = await callJoinPlcQuizSyncGroup(
            plc.id,
            target.plcQuizId
          );
          joinedGroupId = joinResult.groupId;
          const liveVersion = Math.max(canonical.version, joinResult.version);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: liveVersion,
          });
          addToast(
            t('plcDashboard.quizLibrary.importedSync', {
              title: target.title,
              defaultValue: '"{{title}}" added to your library (synced).',
            }),
            'success'
          );
        } else {
          addToast(
            t('plcDashboard.quizLibrary.importedCopy', {
              title: target.title,
              defaultValue: '"{{title}}" copied to your library.',
            }),
            'success'
          );
        }
      } catch (err) {
        logError('usePlcQuizActions.import', err, {
          plcId: plc.id,
          plcQuizId: target.plcQuizId,
          mode,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('usePlcQuizActions.import.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteQuiz(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError('usePlcQuizActions.import.rollbackQuiz', rollbackErr, {
              plcId: plc.id,
              quizId: savedMeta.id,
              driveFileId: savedMeta.driveFileId,
            });
          }
        }
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.quizLibrary.importFailed', {
                defaultValue: 'Failed to import quiz.',
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
      deleteQuiz,
      isDriveConnected,
      personalBySyncGroup,
      plc.id,
      saveQuiz,
      t,
      user,
    ]
  );

  const handleAssign = useCallback(
    async (target: PlcQuizActionTarget, mode: SharedAssignmentImportMode) => {
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

      setAssignTarget(null);
      setBusyRowId(target.plcQuizId);
      const entry = entryById.get(target.plcQuizId);
      let savedMeta: Awaited<ReturnType<typeof saveQuiz>> | null = null;
      let joinedGroupId: string | null = null;
      let liveVersion: number | undefined;
      try {
        const canonical = await pullSyncedQuizContent(target.syncGroupId);
        const now = Date.now();
        const fresh: QuizData = {
          id: crypto.randomUUID(),
          title: canonical.title,
          questions: canonical.questions,
          ...(canonical.stimuli && canonical.stimuli.length > 0
            ? { stimuli: canonical.stimuli }
            : {}),
          ...(canonical.language ? { language: canonical.language } : {}),
          createdAt: now,
          updatedAt: now,
        };
        savedMeta = await saveQuiz(fresh, undefined, canonical.behavior);
        if (mode === 'sync') {
          const joinResult = await callJoinPlcQuizSyncGroup(
            plc.id,
            target.plcQuizId
          );
          joinedGroupId = joinResult.groupId;
          liveVersion = Math.max(canonical.version, joinResult.version);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: liveVersion,
          });
        }

        const plcLinkage = buildPlcLinkage(plc);
        const created = await createAssignment(
          {
            id: savedMeta.id,
            title: savedMeta.title,
            driveFileId: savedMeta.driveFileId,
            questions: canonical.questions,
            ...(canonical.stimuli && canonical.stimuli.length > 0
              ? { stimuli: canonical.stimuli }
              : {}),
            ...(canonical.language ? { language: canonical.language } : {}),
          },
          {
            ...(canonical.behavior ?? {
              sessionMode:
                entry?.sessionMode ?? DEFAULT_QUIZ_BEHAVIOR.sessionMode,
              sessionOptions:
                entry?.sessionOptions ?? DEFAULT_QUIZ_BEHAVIOR.sessionOptions,
              // null = unlimited (explicit); only an absent value falls back.
              attemptLimit:
                entry && entry.attemptLimit !== undefined
                  ? entry.attemptLimit
                  : DEFAULT_QUIZ_BEHAVIOR.attemptLimit,
            }),
            ...(plcLinkage ? { plc: plcLinkage } : {}),
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
                title: target.title,
                defaultValue:
                  '"{{title}}" added to your board (paused, synced).',
              })
            : t('plcDashboard.assignmentsLibrary.importedCopy', {
                title: target.title,
                defaultValue: '"{{title}}" copied to your board (paused).',
              }),
          'success'
        );

        setPendingSetup({ id: created.id, quizTitle: target.title });
      } catch (err) {
        logError('usePlcQuizActions.assign', err, {
          plcId: plc.id,
          plcQuizId: target.plcQuizId,
          mode,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('usePlcQuizActions.assign.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteQuiz(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError('usePlcQuizActions.assign.rollbackQuiz', rollbackErr, {
              plcId: plc.id,
              quizId: savedMeta.id,
              driveFileId: savedMeta.driveFileId,
            });
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
      entryById,
      isDriveConnected,
      plc,
      saveQuiz,
      t,
      user,
    ]
  );

  const handleEdit = useCallback(
    async (target: PlcQuizActionTarget) => {
      if (!user) return;
      if (!isDriveConnected) {
        addToast(
          t('plcDashboard.quizLibrary.driveRequiredForEdit', {
            defaultValue:
              'Connect Google Drive in your account to edit PLC quizzes.',
          }),
          'error'
        );
        return;
      }

      setBusyRowId(target.plcQuizId);
      let savedMeta: Awaited<ReturnType<typeof saveQuiz>> | null = null;
      let joinedGroupId: string | null = null;
      let autoImported = false;
      try {
        let personalMeta: QuizMetadata | undefined = personalBySyncGroup.get(
          target.syncGroupId
        );
        if (!personalMeta) {
          autoImported = true;
          const canonical = await pullSyncedQuizContent(target.syncGroupId);
          const now = Date.now();
          const fresh: QuizData = {
            id: crypto.randomUUID(),
            title: canonical.title,
            questions: canonical.questions,
            ...(canonical.stimuli && canonical.stimuli.length > 0
              ? { stimuli: canonical.stimuli }
              : {}),
            ...(canonical.language ? { language: canonical.language } : {}),
            createdAt: now,
            updatedAt: now,
          };
          savedMeta = await saveQuiz(fresh, undefined, canonical.behavior);
          const joinResult = await callJoinPlcQuizSyncGroup(
            plc.id,
            target.plcQuizId
          );
          joinedGroupId = joinResult.groupId;
          const liveVersion = Math.max(canonical.version, joinResult.version);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: liveVersion,
          });
          personalMeta = {
            ...savedMeta,
            sync: {
              groupId: target.syncGroupId,
              lastSyncedVersion: liveVersion,
            },
          };
        }

        const quizData = await loadQuizData(personalMeta.driveFileId);
        setEditing({ quiz: quizData, meta: personalMeta });
        if (autoImported) {
          addToast(
            t('plcDashboard.quizLibrary.editAutoImported', {
              title: target.title,
              defaultValue:
                '"{{title}}" added to your library — opening editor.',
            }),
            'info'
          );
        }
      } catch (err) {
        logError('usePlcQuizActions.edit', err, {
          plcId: plc.id,
          plcQuizId: target.plcQuizId,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('usePlcQuizActions.edit.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteQuiz(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError('usePlcQuizActions.edit.rollbackQuiz', rollbackErr, {
              plcId: plc.id,
              quizId: savedMeta.id,
              driveFileId: savedMeta.driveFileId,
            });
          }
        }
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.quizLibrary.editFailed', {
                defaultValue: 'Failed to open editor.',
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
      deleteQuiz,
      isDriveConnected,
      loadQuizData,
      personalBySyncGroup,
      plc.id,
      saveQuiz,
      t,
      user,
    ]
  );

  const handleSaveEdit = useCallback(
    async (updated: QuizData, behavior: QuizBehaviorSettings) => {
      if (!editing) return;
      setSavingReplicaId(editing.meta.id);
      try {
        await saveQuiz(updated, editing.meta.driveFileId, behavior);
        const groupId = editing.meta.sync?.groupId;
        const header = groupId
          ? plcQuizzes.find((q) => q.syncGroupId === groupId)
          : undefined;
        if (header) {
          void mirrorPlcQuizHeader(header.id, {
            title: updated.title,
            questionCount: updated.questions.length,
            sessionMode: behavior.sessionMode,
            sessionOptions: behavior.sessionOptions,
            attemptLimit: behavior.attemptLimit,
          });
        }
        addToast(
          t('plcDashboard.quizLibrary.editSaved', {
            defaultValue: 'Quiz saved — teammates will sync automatically.',
          }),
          'success'
        );
      } catch (err) {
        if (err instanceof SyncedQuizVersionConflictError) {
          try {
            await pullSyncedQuiz(editing.meta);
          } catch (pullErr) {
            logError('usePlcQuizActions.saveEdit.autoPull', pullErr, {
              plcId: plc.id,
              quizId: editing.meta.id,
              syncGroupId: editing.meta.sync?.groupId ?? null,
            });
          }
          setEditing(null);
          addToast(
            t('plcDashboard.quizLibrary.editConflict', {
              defaultValue:
                'Another teacher published an update to this quiz. We pulled their changes; your unsaved edits were not saved. Reopen the quiz to re-apply.',
            }),
            'warning'
          );
          return;
        }
        throw err;
      } finally {
        setSavingReplicaId(null);
      }
    },
    [
      addToast,
      editing,
      mirrorPlcQuizHeader,
      plc.id,
      plcQuizzes,
      pullSyncedQuiz,
      saveQuiz,
      t,
    ]
  );

  const handleShareFromPicker = useCallback(
    async (personalQuizId: string): Promise<void> => {
      let groupCreatedAndLinked: { syncGroupId: string } | null = null;
      try {
        if (!user) throw new Error('Not authenticated.');
        const meta = personalQuizzes.find((q) => q.id === personalQuizId);
        if (!meta) throw new Error('Quiz no longer in your library.');
        if (meta.sync?.groupId && plcSyncGroupIds.has(meta.sync.groupId)) {
          addToast(
            t('plcDashboard.quizLibrary.sharePicker.alreadySharedToast', {
              title: meta.title,
              defaultValue: '"{{title}}" is already shared with this PLC.',
            }),
            'info'
          );
          setSharePickerOpen(false);
          return;
        }

        const data = await loadQuizData(meta.driveFileId);
        let syncGroupId: string;
        if (meta.sync) {
          syncGroupId = meta.sync.groupId;
        } else {
          syncGroupId = crypto.randomUUID();
          await createSyncedQuizGroup({
            groupId: syncGroupId,
            uid: user.uid,
            title: data.title,
            questions: data.questions,
            plcId: plc.id,
            behavior: meta.behavior,
          });
          try {
            await attachSyncLinkage(meta.id, {
              groupId: syncGroupId,
              lastSyncedVersion: 1,
            });
            groupCreatedAndLinked = { syncGroupId };
          } catch (linkageErr) {
            try {
              await callLeaveSyncedQuizGroup(syncGroupId);
            } catch (leaveErr) {
              logError(
                'usePlcQuizActions.shareFromPicker.rollbackLeave',
                leaveErr,
                { plcId: plc.id, syncGroupId }
              );
            }
            throw linkageErr;
          }
        }

        const ownerEmailLower =
          getPlcMemberEmail(plc, user.uid) ??
          (user.email ? user.email.toLowerCase() : '');
        const { sessionMode, sessionOptions, attemptLimit } =
          getQuizBehavior(meta);
        await writePlcQuizEntry(plc.id, user.uid, {
          plcQuizId: crypto.randomUUID(),
          syncGroupId,
          title: data.title,
          questionCount: data.questions.length,
          sharedByName: user.displayName ?? '',
          sharedByEmail: ownerEmailLower,
          sessionMode,
          sessionOptions,
          attemptLimit,
          quizId: meta.id,
        });

        addToast(
          t('plcDashboard.quizLibrary.sharePicker.sharedToast', {
            title: meta.title,
            defaultValue: '"{{title}}" shared with this PLC.',
          }),
          'success'
        );
        setSharePickerOpen(false);
      } catch (err) {
        // `orphanedGroup` = the group + linkage landed but the PLC header write didn't.
        const code = groupCreatedAndLinked
          ? 'usePlcQuizActions.shareFromPicker.orphanedGroup'
          : 'usePlcQuizActions.shareFromPicker';
        logError(code, err, {
          plcId: plc.id,
          personalQuizId,
          ...(groupCreatedAndLinked
            ? { syncGroupId: groupCreatedAndLinked.syncGroupId }
            : {}),
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.quizLibrary.sharePicker.shareFailed', {
                defaultValue: 'Failed to share quiz with this PLC.',
              }),
          'error'
        );
      }
    },
    [
      addToast,
      attachSyncLinkage,
      loadQuizData,
      personalQuizzes,
      plc,
      plcSyncGroupIds,
      t,
      user,
    ]
  );

  const isInLibrary = useCallback(
    (syncGroupId: string) => personalBySyncGroup.has(syncGroupId),
    [personalBySyncGroup]
  );

  const openVersionHistory = useCallback((target: PlcQuizActionTarget) => {
    setVersionTarget({ syncGroupId: target.syncGroupId, title: target.title });
  }, []);

  const editQuiz = useCallback(
    (target: PlcQuizActionTarget) => void handleEdit(target),
    [handleEdit]
  );

  const modals = (
    <>
      {importTarget && (
        <PlcQuizImportModal
          quizTitle={importTarget.title}
          sharedByName={importTarget.sharedByName ?? ''}
          onPick={(mode) => void handleImport(importTarget, mode)}
          onClose={() => setImportTarget(null)}
        />
      )}
      {assignTarget && (
        <PlcAssignmentImportModal
          quizTitle={assignTarget.title}
          sharedByName={assignTarget.sharedByName ?? ''}
          onPick={(mode) => void handleAssign(assignTarget, mode)}
          onClose={() => setAssignTarget(null)}
        />
      )}
      {pendingSetup &&
        (() => {
          // Fall back to an import-time stub while the assignments snapshot catches up.
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
                setPendingAssignmentEdit(pendingSetup.id);
                setPendingSetup(null);
                onCloseDashboard();
              }}
              onClose={() => setPendingSetup(null)}
            />
          );
        })()}
      <QuizEditorModal
        isOpen={editing !== null}
        quiz={editing?.quiz ?? null}
        behavior={editing ? getQuizBehavior(editing.meta) : undefined}
        onClose={() => setEditing(null)}
        onSave={handleSaveEdit}
      />
      {versionTarget && canEdit && (
        <PlcVersionHistoryPanel
          plc={plc}
          groupId={versionTarget.syncGroupId}
          kind="quiz"
          title={versionTarget.title}
          onClose={() => setVersionTarget(null)}
        />
      )}
      {conflicts.length > 0 && (
        <PlcSyncConflictPrompt
          conflict={conflicts[0]}
          onResolve={resolveConflict}
        />
      )}
      {sharePickerOpen && (
        <PlcSharePickerModal
          title={t('plcDashboard.quizLibrary.sharePicker.title', {
            defaultValue: 'Share a quiz with this PLC',
          })}
          subtitle={plc.name}
          prompt={t('plcDashboard.quizLibrary.sharePicker.prompt', {
            defaultValue:
              'Pick a quiz from your personal library. Teammates will then be able to import it from this list.',
          })}
          emptyMessage={t('plcDashboard.quizLibrary.sharePicker.empty', {
            defaultValue: 'You have no quizzes in your personal library yet.',
          })}
          items={sharePickerItems}
          onPick={handleShareFromPicker}
          onClose={() => setSharePickerOpen(false)}
        />
      )}
    </>
  );

  return {
    importQuiz: setImportTarget,
    reimportQuiz: setImportTarget,
    assignQuiz: setAssignTarget,
    editQuiz,
    openVersionHistory,
    openSharePicker: () => setSharePickerOpen(true),
    busyRowId,
    busy: busyRowId !== null || pendingSetup !== null,
    isDriveConnected,
    isInLibrary,
    modals,
  };
}
