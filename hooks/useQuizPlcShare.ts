import { useCallback, useState } from 'react';
import type { Plc, QuizAssignment, QuizMetadata } from '@/types';
import type { AuthContextType } from '@/context/AuthContextValue';
import type { DashboardContextValue } from '@/context/DashboardContextValue';
import type { DialogContextValue } from '@/context/DialogContextValue';
import type { UseQuizResult } from '@/hooks/useQuiz';
import type { UseQuestionBanksResult } from '@/hooks/useQuestionBanks';
import type { UseQuizAssignmentsResult } from '@/hooks/useQuizAssignments';
import type { BankSource } from '@/hooks/useBankSources';
import {
  callLeaveSyncedQuizGroup,
  createSyncedQuizGroup,
  syncedTranslationsInput,
} from '@/hooks/useSyncedQuizGroups';
import { writePlcQuizEntry } from '@/hooks/usePlcQuizzes';
import {
  quizHasBankSlots,
  quizServedQuestionCount,
} from '@/utils/questionBanks';
import {
  reconcileBankSlotsForPlcShare,
  unsharedBanksMessage,
} from '@/utils/questionBankShare';
import { logError } from '@/utils/logError';
import { getPlcMemberEmail } from '@/utils/plc';
import { getQuizBehavior } from '@/utils/quizBehavior';
import { syncedQuizContentFields } from '@/utils/syncedQuizContent';
import { isSandboxed } from '@/utils/tourSandbox';

interface UseQuizPlcShareArgs {
  user: AuthContextType['user'];
  plcs: Plc[];
  banks: UseQuestionBanksResult['banks'];
  sharedBankSources: BankSource[];
  loadQuizData: UseQuizResult['loadQuizData'];
  saveQuiz: UseQuizResult['saveQuiz'];
  attachSyncLinkage: UseQuizResult['attachSyncLinkage'];
  loadSyncedTranslations: UseQuizResult['loadSyncedTranslations'];
  addToast: DashboardContextValue['addToast'];
  showConfirm: DialogContextValue['showConfirm'];
  shareAssignmentWithPlc: UseQuizAssignmentsResult['shareAssignmentWithPlc'];
  stopSharingAssignmentWithPlc: UseQuizAssignmentsResult['stopSharingAssignmentWithPlc'];
  setSharePlcResultsTarget: (target: QuizAssignment | null) => void;
}

// The two handle* callbacks keep their useCallback deps; the rest are fresh each render, as the inline props were.
export const useQuizPlcShare = ({
  user,
  plcs,
  banks,
  sharedBankSources,
  loadQuizData,
  saveQuiz,
  attachSyncLinkage,
  loadSyncedTranslations,
  addToast,
  showConfirm,
  shareAssignmentWithPlc,
  stopSharingAssignmentWithPlc,
  setSharePlcResultsTarget,
}: UseQuizPlcShareArgs) => {
  // "Share with PLC" targets — when non-empty, the PlcShareTargetModal is
  // open for these quizzes (one entry for the kebab action, many for bulk).
  const [shareWithPlcTargets, setShareWithPlcTargets] = useState<
    QuizMetadata[]
  >([]);

  /**
   * Phase 2 — share an existing personal quiz with a chosen PLC.
   *
   * Order of operations:
   *   1. Load the quiz content from Drive (needed to seed the canonical
   *      synced group on first share).
   *   2. If the quiz isn't yet part of a synced group, mint a fresh group
   *      with `plcId` set, then attach the linkage to the local
   *      `quiz_metadata` so subsequent edits publish (LWW) for every
   *      member who imports. If `attachSyncLinkage` fails, leave the
   *      freshly-minted group via `callLeaveSyncedQuizGroup` so we don't
   *      leave a phantom participant entry — the empty group itself
   *      stays (synced_quizzes rules intentionally don't delete empty
   *      groups; future paste of the same id should still resolve).
   *   3. Write the `plcs/{plcId}/quizzes/{plcQuizId}` header. Doc id is a
   *      fresh uuid so the same quiz can be shared with multiple PLCs
   *      without doc-id collisions.
   *
   * If step 3 fails after step 2 succeeded, the synced group + sync
   * linkage stay in place — the canonical doc is reachable from the
   * user's library card as the "Synced" pill (self-only group), and a
   * retry of "Share with PLC" reuses the existing groupId rather than
   * minting a new one. Idempotent on retry.
   */
  const handleShareWithPlc = useCallback(
    async (quizMeta: QuizMetadata, plcId: string): Promise<void> => {
      if (!user) throw new Error('Not authenticated.');
      const plc = plcs.find((p) => p.id === plcId);
      if (!plc) {
        throw new Error('That PLC is no longer available.');
      }
      // A tour's sandbox shares nothing.
      if (isSandboxed(quizMeta.id)) return;
      let data = await loadQuizData(quizMeta.driveFileId);
      // Decision 24: every bank slot must draw from a bank shared with this PLC.
      if (quizHasBankSlots(data)) {
        const check = reconcileBankSlotsForPlcShare(
          data,
          banks,
          plcId,
          sharedBankSources,
          user.uid
        );
        if (check.unsharedBankTitles.length > 0) {
          throw new Error(unsharedBanksMessage(check.unsharedBankTitles));
        }
        if (check.changed) {
          data = { ...data, bankSlots: check.bankSlots };
          await saveQuiz(data, quizMeta.driveFileId);
        }
      }

      let syncGroupId: string;
      if (quizMeta.sync) {
        syncGroupId = quizMeta.sync.groupId;
      } else {
        syncGroupId = crypto.randomUUID();
        await createSyncedQuizGroup({
          groupId: syncGroupId,
          uid: user.uid,
          title: data.title,
          questions: data.questions,
          ...syncedQuizContentFields(data),
          plcId,
          behavior: quizMeta.behavior,
          // Peers cannot read the owner's drive.file sidecars, so seed the
          // group doc with them at share time (plan §11 PR5).
          ...syncedTranslationsInput(
            await loadSyncedTranslations(quizMeta, {
              title: data.title,
              questions: data.questions,
              stimuli: data.stimuli,
              behavior: quizMeta.behavior,
            })
          ),
        });
        try {
          await attachSyncLinkage(quizMeta.id, {
            groupId: syncGroupId,
            lastSyncedVersion: 1,
          });
        } catch (linkageErr) {
          // Best-effort: drop our self-participant entry on the
          // freshly-minted group so we don't leave a phantom participant
          // pointing at a sync group the local library never knew about.
          try {
            await callLeaveSyncedQuizGroup(syncGroupId);
          } catch (leaveErr) {
            logError('QuizWidget.shareWithPlc.rollbackLeave', leaveErr, {
              plcId,
              syncGroupId,
            });
          }
          throw linkageErr;
        }
      }

      const ownerEmailLower =
        getPlcMemberEmail(plc, user.uid) ??
        (user.email ? user.email.toLowerCase() : '');
      // Run-settings ride along so a teammate's pickup starts from the same config.
      const { sessionMode, sessionOptions, attemptLimit } =
        getQuizBehavior(quizMeta);
      await writePlcQuizEntry(plcId, user.uid, {
        plcQuizId: crypto.randomUUID(),
        syncGroupId,
        title: data.title,
        questionCount: quizServedQuestionCount(data),
        sharedByName: user.displayName ?? '',
        sharedByEmail: ownerEmailLower,
        sessionMode,
        sessionOptions,
        attemptLimit,
        quizId: quizMeta.id,
      });
    },
    [
      attachSyncLinkage,
      loadQuizData,
      loadSyncedTranslations,
      plcs,
      user,
      banks,
      sharedBankSources,
      saveQuiz,
    ]
  );

  // D12: clear the PLC results link on an assignment (confirm first).
  const handleStopSharingPlc = useCallback(
    async (a: QuizAssignment): Promise<void> => {
      const plcName = a.plc?.name ?? 'your PLC';
      const ok = await showConfirm(
        `Stop sharing "${a.quizTitle}" results with ${plcName}? Its responses leave the team's pooled view.`,
        {
          title: 'Stop sharing results',
          variant: 'warning',
          confirmLabel: 'Stop sharing',
        }
      );
      if (!ok) return;
      try {
        await stopSharingAssignmentWithPlc(a.id);
        addToast(`No longer sharing results with ${plcName}.`, 'success');
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Could not stop sharing.',
          'error'
        );
      }
    },
    [addToast, showConfirm, stopSharingAssignmentWithPlc]
  );

  const onShareWithPlc = (meta: QuizMetadata) => {
    if (plcs.length === 0) {
      addToast(
        'Join a team under My Teams in the sidebar to share quizzes with teammates.',
        'info'
      );
      return;
    }
    setShareWithPlcTargets([meta]);
  };

  const onBulkShareWithPlc = (metas: QuizMetadata[]) => {
    if (plcs.length === 0) {
      addToast(
        'Join a team under My Teams in the sidebar to share quizzes with teammates.',
        'info'
      );
      return;
    }
    setShareWithPlcTargets(metas);
  };

  const onConfirmShareWithPlc = async (plcId: string) => {
    const plcName = plcs.find((p) => p.id === plcId)?.name ?? 'your PLC';
    // Sequential so a mid-list failure reports exactly what landed.
    const failedTitles: string[] = [];
    for (const target of shareWithPlcTargets) {
      try {
        await handleShareWithPlc(target, plcId);
      } catch (err) {
        failedTitles.push(target.title || 'Untitled');
        logError('QuizWidget.shareWithPlc', err, {
          plcId,
          quizId: target.id,
        });
      }
    }
    const shared = shareWithPlcTargets.length - failedTitles.length;
    if (failedTitles.length === 0) {
      addToast(
        shared === 1
          ? `Shared with ${plcName}.`
          : `Shared ${shared} quizzes with ${plcName}.`,
        'success'
      );
      setShareWithPlcTargets([]);
      return;
    }
    if (shared > 0) {
      addToast(
        `Shared ${shared} of ${shareWithPlcTargets.length} quizzes with ${plcName}.`,
        'warning'
      );
    }
    throw new Error(`Failed to share: ${failedTitles.join(', ')}. Try again.`);
  };

  const onConfirmSharePlcResults = async (
    sharePlcResultsTarget: QuizAssignment,
    plc: Plc,
    poolSyncGroupId: string
  ) => {
    await shareAssignmentWithPlc(sharePlcResultsTarget.id, {
      plc,
      poolSyncGroupId,
    });
    addToast(`Results now pool with ${plc.name}.`, 'success');
    setSharePlcResultsTarget(null);
  };

  return {
    shareWithPlcTargets,
    setShareWithPlcTargets,
    handleStopSharingPlc,
    onShareWithPlc,
    onBulkShareWithPlc,
    onConfirmShareWithPlc,
    onConfirmSharePlcResults,
  };
};
