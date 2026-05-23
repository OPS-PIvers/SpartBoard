/**
 * PlcQuizLibraryBody — Phase 2B body extraction.
 *
 * Owns the entire shared-quiz-library editor (rows, import modal,
 * collaborative editor). Mounted as the "Library" sub-tab of
 * `PlcQuizzesBody`, which supplies the surrounding tab chrome.
 *
 * Behavior:
 *
 *   - "Add to my library" — opens `PlcQuizImportModal` (sync-or-copy
 *     picker). On Sync we pull the canonical content, save a fresh
 *     personal copy, join the synced group via Cloud Function, and
 *     attach the sync linkage so the user's library card thereafter
 *     surfaces the "Synced" / "Sync available" pills. On Copy we just
 *     pull canonical and save a fresh personal copy (no sync linkage).
 *
 *   - "Edit" — opens `QuizEditorModal` against the user's personal
 *     copy. If the user doesn't yet have one, we auto-import via Sync
 *     mode first (mirrors the Sync path of `handleImport`) so the
 *     editor has a Drive-backed canonical to write into. Saving calls
 *     `saveQuiz`, which auto-publishes to `synced_quizzes/{groupId}`
 *     via the existing LWW infrastructure — teammates whose libraries
 *     are also synced to this group pick up the change on the next
 *     snapshot.
 *
 *   - "Unshare" — any current member can remove a PLC quiz entry
 *     (PLC-owned model — quizzes shared with the PLC belong to the PLC,
 *     not the original sharer). The canonical `synced_quizzes/{groupId}`
 *     doc is intentionally left in place; orphan-tolerant per the
 *     Phase 2 spec.
 *
 *   - Already-imported indicator — when the user's personal library
 *     already carries a `sync.groupId === plcQuiz.syncGroupId`, the row
 *     shows an "In your library" badge. Re-importing in Sync mode is a
 *     no-op (informational toast — duplicating a synced linkage would
 *     just create two personal copies pointing at the same group); Copy
 *     mode still creates a fresh snapshot.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Cloud,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users2,
} from 'lucide-react';
import type {
  Plc,
  QuizAssignment,
  QuizBehaviorSettings,
  QuizData,
  QuizMetadata,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { usePlcAssignments } from '@/hooks/usePlcAssignments';
import { usePlcQuizzes, writePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import { SyncedQuizVersionConflictError, useQuiz } from '@/hooks/useQuiz';
import {
  callJoinPlcAssignmentSyncGroup,
  callJoinPlcQuizSyncGroup,
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
  pullSyncedQuizContent,
} from '@/hooks/useSyncedQuizGroups';
import { useQuizAssignments } from '@/hooks/useQuizAssignments';
import type { SharedAssignmentImportMode } from '@/hooks/useQuizAssignments';
import { logError } from '@/utils/logError';
import { getQuizBehavior } from '@/utils/quizBehavior';
import { PlcAssignmentImportModal } from '../PlcAssignmentImportModal';
import { PlcQuizImportModal } from '../PlcQuizImportModal';
import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from '../PlcSharePickerModal';
import { QuizEditorModal } from '@/components/widgets/QuizWidget/components/QuizEditorModal';
import { QuizAssignmentImportSetupModal } from '@/components/quiz/QuizAssignmentImportSetupModal';
import {
  unifyAssignableQuizzes,
  type AssignableQuizRow,
} from './unifyAssignableQuizzes';

interface PlcQuizLibraryBodyProps {
  plc: Plc;
  /**
   * Closes the PLC dashboard overlay. Invoked when the post-assign
   * "Edit all settings…" link is clicked so the teacher can be handed
   * off to the QuizWidget's full assignment editor without the PLC
   * dashboard staying open behind it.
   */
  onCloseDashboard: () => void;
}

interface ImportTarget {
  plcQuizId: string;
  syncGroupId: string;
  title: string;
  sharedByName: string;
}

/**
 * Target for the "Assign to my classes" flow. Carries the resolved
 * run-settings (from the unified row) plus the routing info needed to
 * pick the right sync-join Cloud Function: a `'quiz'`-source row joins via
 * `callJoinPlcQuizSyncGroup(plcId, plcQuizId)`, a `'template'`-source row
 * via `callJoinPlcAssignmentSyncGroup(plcId, plcAssignmentId)`.
 */
type AssignTarget = AssignableQuizRow & {
  /** Doc id of the source row, used to route the sync-join Cloud Function. */
  sourceId: string;
};

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

export const PlcQuizLibraryBody: React.FC<PlcQuizLibraryBodyProps> = ({
  plc,
  onCloseDashboard,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addToast, rosters, setPendingAssignmentEdit } = useDashboard();
  const { showConfirm } = useDialog();
  const {
    quizzes: plcQuizzes,
    loading,
    unshareQuizFromPlc,
  } = usePlcQuizzes(plc.id);
  // Read-time union with legacy assignment templates so template-only rows
  // (authored before the libraries collapsed) stay visible and assignable
  // during the transition. Deduped by syncGroupId — a PlcQuizEntry wins.
  //
  // Kept as a live `onSnapshot` listener (B2 reviewed, intentionally not
  // converted to a one-shot read): `deleteAssignmentTemplate` removes a doc
  // from this same collection in `handleUnshareTemplate`, and the row list
  // must drop the unshared template immediately afterward. A one-shot read
  // would leave the deleted row on screen until a manual refetch, so the
  // marginal saving on this usually-tiny legacy collection isn't worth the
  // post-unshare refresh regression.
  const { templates, deleteAssignmentTemplate } = usePlcAssignments(plc.id);
  const {
    quizzes: personalQuizzes,
    saveQuiz,
    deleteQuiz,
    attachSyncLinkage,
    loadQuizData,
    pullSyncedQuiz,
    isDriveConnected,
  } = useQuiz(user?.uid);

  const [importTarget, setImportTarget] = useState<ImportTarget | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    quiz: QuizData;
    meta: QuizMetadata;
  } | null>(null);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  // Tracks the freshly-assigned assignment that still needs class-period
  // targeting. Holds enough data to render the picker before the
  // assignments snapshot surfaces the new doc (snapshot lag would
  // otherwise drop the prompt silently).
  const [pendingSetup, setPendingSetup] = useState<{
    id: string;
    quizTitle: string;
  } | null>(null);

  // Cost guard: this hook subscribes to the whole
  // `users/{uid}/quiz_assignments` collection, but its outputs (`assignments`,
  // `createAssignment`, `setAssignmentRosters`) are only needed while an
  // assign is in flight — the import modal (`assignTarget`) or the class-period
  // picker (`pendingSetup`). Pass `undefined` as the uid otherwise so the
  // listener never mounts on a plain Library-tab view. `assignTarget` is set
  // (opening the import modal) before `handleAssign` fires, so by the time
  // `createAssignment` runs the hook has already re-subscribed with the real
  // uid; same for `pendingSetup` gating `setAssignmentRosters`.
  const { assignments, createAssignment, setAssignmentRosters } =
    useQuizAssignments(assignTarget || pendingSetup ? user?.uid : undefined);

  // The unified, deduped, assignable row list.
  const assignableRows = useMemo(
    () => unifyAssignableQuizzes(plcQuizzes, templates),
    [plcQuizzes, templates]
  );

  const personalBySyncGroup = useMemo(() => {
    const map = new Map<string, QuizMetadata>();
    for (const q of personalQuizzes) {
      if (q.sync?.groupId) map.set(q.sync.groupId, q);
    }
    return map;
  }, [personalQuizzes]);

  // SyncGroupIds already shared with THIS PLC, so the picker can flag
  // duplicates without writing a second `plcs/{plcId}/quizzes/{...}`
  // header for the same canonical group.
  const plcSyncGroupIds = useMemo(
    () => new Set(plcQuizzes.map((q) => q.syncGroupId)),
    [plcQuizzes]
  );

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
    async (target: ImportTarget, mode: SharedAssignmentImportMode) => {
      if (!user) return;
      // Block parallel imports across rows — parity with `handleAssign`. A
      // second concurrent import would let the first `finally` re-enable the
      // buttons mid-flight while the other is still running.
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
          createdAt: now,
          updatedAt: now,
        };
        savedMeta = await saveQuiz(fresh);
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
        logError('PlcQuizLibraryBody.import', err, {
          plcId: plc.id,
          plcQuizId: target.plcQuizId,
          mode,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('PlcQuizLibraryBody.import.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteQuiz(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError('PlcQuizLibraryBody.import.rollbackQuiz', rollbackErr, {
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

  /**
   * "Assign to my classes" — ports the proven assign-pickup flow from
   * the former `PlcAssignmentsLibrarySubTab.handleImport`. Pulls the canonical
   * content, saves a fresh personal quiz copy, on Sync joins the canonical
   * group + attaches linkage, then creates a paused personal assignment
   * using the row's resolved run-settings and chains into the class-period
   * picker.
   *
   * Sync-join routing differs by source: a `'quiz'` row joins via
   * `callJoinPlcQuizSyncGroup`, a `'template'` row via
   * `callJoinPlcAssignmentSyncGroup`. Same rollback-on-failure semantics
   * and busy-guard against parallel imports as the original.
   */
  const handleAssign = useCallback(
    async (target: AssignTarget, mode: SharedAssignmentImportMode) => {
      if (!user) return;
      // Block parallel imports across rows — a second resolving
      // createAssignment would clobber setPendingSetup and silently drop
      // the first import's class-period picker.
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
      setBusyRowId(target.sourceId);
      let savedMeta: Awaited<ReturnType<typeof saveQuiz>> | null = null;
      let joinedGroupId: string | null = null;
      // Hoisted so the `syncedFrom` block can tag the new assignment with
      // the same version `attachSyncLinkage` saw. `Math.max` guards against
      // a peer publish landing between the canonical pull and the join.
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
          // attachSyncLinkage so a later editor save doesn't publish from a
          // non-participant context. Route the join by row source.
          const joinResult =
            target.source === 'quiz'
              ? await callJoinPlcQuizSyncGroup(plc.id, target.sourceId)
              : await callJoinPlcAssignmentSyncGroup(plc.id, target.sourceId);
          joinedGroupId = joinResult.groupId;
          liveVersion = Math.max(canonical.version, joinResult.version);
          await attachSyncLinkage(savedMeta.id, {
            groupId: target.syncGroupId,
            lastSyncedVersion: liveVersion,
          });
        }

        // Create the paused personal assignment with the row's session
        // settings. `skipPlcTemplateWrite: true` so assigning an existing
        // shared quiz doesn't recursively author a new template.
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

        // Chain into the class-period picker so teachers don't forget to
        // target the quiz. Cache the title so the modal renders before the
        // assignments snapshot surfaces the new doc.
        setPendingSetup({ id: created.id, quizTitle: target.title });
      } catch (err) {
        logError('PlcQuizLibraryBody.assign', err, {
          plcId: plc.id,
          source: target.source,
          sourceId: target.sourceId,
          mode,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('PlcQuizLibraryBody.assign.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteQuiz(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError('PlcQuizLibraryBody.assign.rollbackQuiz', rollbackErr, {
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
      isDriveConnected,
      plc.id,
      saveQuiz,
      t,
      user,
    ]
  );

  const handleEdit = useCallback(
    async (target: ImportTarget) => {
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
            createdAt: now,
            updatedAt: now,
          };
          savedMeta = await saveQuiz(fresh);
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
        setEditing({
          quiz: quizData,
          meta: personalMeta,
        });
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
        logError('PlcQuizLibraryBody.edit', err, {
          plcId: plc.id,
          plcQuizId: target.plcQuizId,
        });
        if (joinedGroupId) {
          try {
            await callLeaveSyncedQuizGroup(joinedGroupId);
          } catch (leaveErr) {
            logError('PlcQuizLibraryBody.edit.rollbackLeave', leaveErr, {
              plcId: plc.id,
              groupId: joinedGroupId,
            });
          }
        }
        if (savedMeta) {
          try {
            await deleteQuiz(savedMeta.id, savedMeta.driveFileId);
          } catch (rollbackErr) {
            logError('PlcQuizLibraryBody.edit.rollbackQuiz', rollbackErr, {
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
      try {
        await saveQuiz(updated, editing.meta.driveFileId, behavior);
        addToast(
          t('plcDashboard.quizLibrary.editSaved', {
            defaultValue: 'Quiz saved — teammates will sync on next refresh.',
          }),
          'success'
        );
      } catch (err) {
        if (err instanceof SyncedQuizVersionConflictError) {
          try {
            await pullSyncedQuiz(editing.meta);
          } catch (pullErr) {
            logError('PlcQuizLibraryBody.handleSaveEdit.autoPull', pullErr, {
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
      }
    },
    [addToast, editing, plc.id, pullSyncedQuiz, saveQuiz, t]
  );

  /**
   * Phase 2 "Share with this PLC" — invoked from the in-tab picker.
   * Mirrors `QuizWidget.handleShareWithPlc`: load Drive content, mint a
   * synced group if one doesn't exist yet, attach sync linkage so the
   * teacher's own copy stays in lockstep with the shared canonical, then
   * write the PLC subcoll header. The picker calls this with the
   * teacher's personal quiz id and the caller closes the modal on
   * success.
   *
   * Failure modes and what each leaves behind:
   *
   *   - `loadQuizData` fails → nothing written. Toast surfaced, picker
   *     stays open for retry.
   *   - `createSyncedQuizGroup` fails → nothing written. Same.
   *   - `attachSyncLinkage` fails after group exists → best-effort
   *     `callLeaveSyncedQuizGroup` so we don't leave a phantom
   *     participant. The empty group doc itself stays (synced_quizzes
   *     rules intentionally don't allow client deletes). If the rollback
   *     itself fails it's logged with a distinctive code so ops can find
   *     the orphan; the user only sees the original linkage error toast.
   *   - `writePlcQuizEntry` fails after group + linkage succeeded →
   *     **known gap**. The local quiz keeps the sync linkage; the synced
   *     group sits with the user as sole participant ("self-only sync").
   *     A retry sees `meta.sync` and skips group creation, so no duplicate
   *     groups are minted. The PLC header gets a fresh `plcQuizId` per
   *     attempt; if the snapshot hasn't caught up the picker won't yet
   *     show "Already shared", which can produce two PLC headers pointing
   *     at one synced group across multiple successful retries. A full
   *     rollback would require detaching the sync linkage; no
   *     `detachSyncLinkage` API exists yet. Tagged with
   *     `shareFromPicker.orphanedGroup` so the orphan rate is observable
   *     in monitoring.
   *
   * The caller (`PlcSharePickerModal.handlePick`) does NOT re-throw —
   * surfacing the failure via toast inside the catch is enough, and
   * re-throwing would leave a dangling unhandled-rejection on the React
   * event handler.
   */
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
                'PlcQuizLibraryBody.shareFromPicker.rollbackLeave',
                leaveErr,
                { plcId: plc.id, syncGroupId }
              );
            }
            throw linkageErr;
          }
        }

        const ownerEmailLower =
          plc.memberEmails?.[user.uid] ??
          (user.email ? user.email.toLowerCase() : '');
        // Capture the quiz's behavior at share time so the shared quiz carries
        // default run-settings a teammate can pick up when assigning.
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
        // Tag with a distinctive code when the failure happened AFTER the
        // synced group + linkage are in place — this is the orphan case
        // documented above. Searchable in monitoring as
        // `shareFromPicker.orphanedGroup`.
        const code = groupCreatedAndLinked
          ? 'PlcQuizLibraryBody.shareFromPicker.orphanedGroup'
          : 'PlcQuizLibraryBody.shareFromPicker';
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
      plc.id,
      plc.memberEmails,
      plcSyncGroupIds,
      t,
      user,
    ]
  );

  const handleUnshare = useCallback(
    async (plcQuizId: string, title: string) => {
      const confirmed = await showConfirm(
        t('plcDashboard.quizLibrary.unshareConfirm', {
          title,
          defaultValue:
            'Remove "{{title}}" from this PLC? Other teammates will lose access to the shared library entry. Their personal copies (if any) keep working.',
        }),
        {
          title: t('plcDashboard.quizLibrary.unshareTitle', {
            defaultValue: 'Unshare quiz',
          }),
          variant: 'warning',
          confirmLabel: t('plcDashboard.quizLibrary.unshareAction', {
            defaultValue: 'Unshare',
          }),
        }
      );
      if (!confirmed) return;
      setBusyRowId(plcQuizId);
      try {
        await unshareQuizFromPlc(plcQuizId);
        addToast(
          t('plcDashboard.quizLibrary.unshared', {
            title,
            defaultValue: '"{{title}}" removed from this PLC.',
          }),
          'success'
        );
      } catch (err) {
        logError('PlcQuizLibraryBody.unshare', err, {
          plcId: plc.id,
          plcQuizId,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.quizLibrary.unshareFailed', {
                defaultValue: 'Failed to unshare quiz.',
              }),
          'error'
        );
      } finally {
        setBusyRowId(null);
      }
    },
    [addToast, plc.id, showConfirm, t, unshareQuizFromPlc]
  );

  /**
   * Unshare a template-only row. Backed by `plcs/{plcId}/assignments/`
   * rather than `plcs/{plcId}/quizzes/`, so it deletes the assignment
   * template doc. Any current member can unshare (PLC-owned model);
   * teammates' already-imported personal assignments keep running.
   */
  const handleUnshareTemplate = useCallback(
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
        logError('PlcQuizLibraryBody.unshareTemplate', err, {
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
      <div
        role="status"
        className="flex items-center justify-center h-full min-h-[200px] text-slate-400"
      >
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        <span className="sr-only">
          {t('plcDashboard.quizLibrary.loading', { defaultValue: 'Loading…' })}
        </span>
      </div>
    );
  }

  const shareCta = (
    <button
      type="button"
      onClick={() => setSharePickerOpen(true)}
      disabled={!isDriveConnected || personalQuizzes.length === 0}
      title={
        !isDriveConnected
          ? t('plcDashboard.quizLibrary.shareCta.driveDisconnected', {
              defaultValue: 'Connect Google Drive to share a quiz.',
            })
          : personalQuizzes.length === 0
            ? t('plcDashboard.quizLibrary.shareCta.noQuizzes', {
                defaultValue: 'No personal quizzes to share yet.',
              })
            : t('plcDashboard.quizLibrary.shareCta.tooltip', {
                defaultValue:
                  'Pick a quiz from your personal library to share with this PLC.',
              })
      }
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-blue-primary text-white text-xs font-bold hover:bg-brand-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      {t('plcDashboard.quizLibrary.shareCta.label', {
        defaultValue: 'Share a quiz with this PLC',
      })}
    </button>
  );

  if (assignableRows.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
            <BookOpen className="w-7 h-7 text-slate-400" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">
            {t('plcDashboard.quizLibrary.emptyTitle', {
              defaultValue: 'No shared quizzes yet',
            })}
          </h3>
          <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-4">
            {t('plcDashboard.quizLibrary.emptySubtitle', {
              defaultValue:
                'Open the Quiz widget in your dashboard, click the kebab on any quiz, and choose "Share with PLC" to add it here.',
            })}
          </p>
          {shareCta}
        </div>
        {sharePickerOpen && (
          <PlcSharePickerModal
            title={t('plcDashboard.quizLibrary.sharePicker.title', {
              defaultValue: 'Share a quiz with this PLC',
            })}
            subtitle={plc.name}
            prompt={t('plcDashboard.quizLibrary.sharePicker.prompt', {
              defaultValue:
                'Pick a quiz from your personal library. Teammates will then be able to import it from this tab.',
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
  }

  return (
    <div className="flex flex-col gap-3 px-1">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('plcDashboard.quizLibrary.heading', {
            defaultValue: 'Shared Quizzes',
          })}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xxs text-slate-400">
            {t('plcDashboard.quizLibrary.count', {
              count: assignableRows.length,
              defaultValue: '{{count}} quiz',
              defaultValue_other: '{{count}} quizzes',
            })}
          </span>
          {shareCta}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {assignableRows.map((row) => {
          const sourceId =
            row.source === 'quiz' ? row.quiz.id : row.template.id;
          const isMine = row.sharedBy === user?.uid;
          const ownerLabel =
            row.sharedByName?.trim() ||
            row.sharedByEmail ||
            t('plcDashboard.quizLibrary.unknownSharer', {
              defaultValue: 'a teammate',
            });
          const inLibrary = personalBySyncGroup.has(row.syncGroupId);
          const isBusy = busyRowId === sourceId;
          // Disable assign/unshare across all rows while any import is in
          // flight OR the post-assign class-period picker is open — a second
          // assign would clobber `pendingSetup` and drop the first picker.
          const anyImportBusy = busyRowId !== null || pendingSetup !== null;
          return (
            <div
              key={sourceId}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 hover:border-brand-blue-light rounded-xl transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                <BookOpen
                  className="w-4 h-4 text-brand-blue-primary"
                  aria-hidden="true"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {row.title}
                  </div>
                  {inLibrary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                      <Cloud className="w-3 h-3" aria-hidden="true" />
                      {t('plcDashboard.quizLibrary.inLibrary', {
                        defaultValue: 'In your library',
                      })}
                    </span>
                  )}
                </div>
                <div className="text-xxs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="truncate flex items-center gap-1">
                    <Users2 className="w-3 h-3" aria-hidden="true" />
                    {t('plcDashboard.quizLibrary.bySharer', {
                      name: ownerLabel,
                      defaultValue: 'shared by {{name}}',
                    })}
                  </span>
                  {row.source === 'quiz' && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span>
                        {t('plcDashboard.quizLibrary.questionCount', {
                          count: row.quiz.questionCount,
                          defaultValue: '{{count}} question',
                          defaultValue_other: '{{count}} questions',
                        })}
                      </span>
                    </>
                  )}
                  <span className="text-slate-300">•</span>
                  <span>{formatDate(row.updatedAt)}</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setAssignTarget({ ...row, sourceId })}
                  disabled={anyImportBusy || !isDriveConnected}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary hover:bg-brand-blue-dark text-white rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                  aria-label={t('plcDashboard.quizLibrary.assignToClasses', {
                    defaultValue: 'Assign to my classes',
                  })}
                  title={t('plcDashboard.quizLibrary.assignToClasses', {
                    defaultValue: 'Assign to my classes',
                  })}
                >
                  {isBusy ? (
                    <Loader2
                      className="w-3 h-3 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Plus className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">
                    {t('plcDashboard.quizLibrary.assignToClasses', {
                      defaultValue: 'Assign to my classes',
                    })}
                  </span>
                </button>
                {row.source === 'quiz' && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setImportTarget({
                          plcQuizId: row.quiz.id,
                          syncGroupId: row.syncGroupId,
                          title: row.title,
                          sharedByName: row.sharedByName,
                        })
                      }
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-lighter hover:bg-brand-blue-light/30 text-brand-blue-primary rounded-lg text-xxs font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                      aria-label={
                        inLibrary
                          ? t('plcDashboard.quizLibrary.reimport', {
                              defaultValue: 'Re-import',
                            })
                          : t('plcDashboard.quizLibrary.addToMyLibrary', {
                              defaultValue: 'Add to my library',
                            })
                      }
                      title={
                        inLibrary
                          ? t('plcDashboard.quizLibrary.reimport', {
                              defaultValue: 'Re-import',
                            })
                          : t('plcDashboard.quizLibrary.addToMyLibrary', {
                              defaultValue: 'Add to my library',
                            })
                      }
                    >
                      <Download className="w-3 h-3" aria-hidden="true" />
                      <span className="hidden sm:inline">
                        {inLibrary
                          ? t('plcDashboard.quizLibrary.reimport', {
                              defaultValue: 'Re-import',
                            })
                          : t('plcDashboard.quizLibrary.addToMyLibrary', {
                              defaultValue: 'Add to my library',
                            })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleEdit({
                          plcQuizId: row.quiz.id,
                          syncGroupId: row.syncGroupId,
                          title: row.title,
                          sharedByName: row.sharedByName,
                        })
                      }
                      disabled={isBusy || !isDriveConnected}
                      aria-label={t('plcDashboard.quizLibrary.editAction', {
                        defaultValue: 'Edit',
                      })}
                      title={
                        inLibrary
                          ? t('plcDashboard.quizLibrary.editTooltip', {
                              defaultValue:
                                'Edit collaboratively (changes sync to teammates)',
                            })
                          : t(
                              'plcDashboard.quizLibrary.editTooltipAutoImport',
                              {
                                defaultValue:
                                  'Edit collaboratively — adds to your library on first edit',
                              }
                            )
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-brand-blue-lighter hover:text-brand-blue-primary transition-colors disabled:opacity-40"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() =>
                    row.source === 'quiz'
                      ? void handleUnshare(row.quiz.id, row.title)
                      : void handleUnshareTemplate(row.template.id, row.title)
                  }
                  disabled={anyImportBusy}
                  aria-label={t('plcDashboard.quizLibrary.unshareAction', {
                    defaultValue: 'Unshare',
                  })}
                  title={
                    isMine
                      ? t('plcDashboard.quizLibrary.unshareYours', {
                          defaultValue: 'Unshare from PLC',
                        })
                      : t('plcDashboard.quizLibrary.unshareTeammate', {
                          defaultValue:
                            'Unshare from PLC (any member can remove)',
                        })
                  }
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {!isDriveConnected && (
        <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <ExternalLink
            className="w-4 h-4 text-amber-700 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <p className="text-xs text-amber-800">
            {t('plcDashboard.quizLibrary.driveDisconnected', {
              defaultValue:
                'Connect Google Drive to import PLC quizzes into your personal library.',
            })}
          </p>
        </div>
      )}
      {importTarget && (
        <PlcQuizImportModal
          quizTitle={importTarget.title}
          sharedByName={importTarget.sharedByName}
          onPick={(mode) => void handleImport(importTarget, mode)}
          onClose={() => setImportTarget(null)}
        />
      )}
      {assignTarget && (
        <PlcAssignmentImportModal
          quizTitle={assignTarget.title}
          sharedByName={assignTarget.sharedByName}
          onPick={(mode) => void handleAssign(assignTarget, mode)}
          onClose={() => setAssignTarget(null)}
        />
      )}
      {pendingSetup &&
        (() => {
          // Prefer the live snapshot's record once available, but fall
          // back to the import-time stub so a slow Firestore snapshot
          // doesn't drop the prompt. The id is authoritative either way;
          // `setAssignmentRosters` writes against it directly.
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
                // Hand off to the QuizWidget's full settings editor; close
                // the PLC dashboard first so the editor isn't buried.
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
      {sharePickerOpen && (
        <PlcSharePickerModal
          title={t('plcDashboard.quizLibrary.sharePicker.title', {
            defaultValue: 'Share a quiz with this PLC',
          })}
          subtitle={plc.name}
          prompt={t('plcDashboard.quizLibrary.sharePicker.prompt', {
            defaultValue:
              'Pick a quiz from your personal library. Teammates will then be able to import it from this tab.',
          })}
          emptyMessage={t('plcDashboard.quizLibrary.sharePicker.empty', {
            defaultValue: 'You have no quizzes in your personal library yet.',
          })}
          items={sharePickerItems}
          onPick={handleShareFromPicker}
          onClose={() => setSharePickerOpen(false)}
        />
      )}
    </div>
  );
};
