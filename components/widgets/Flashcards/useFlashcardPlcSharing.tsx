// Share flashcard sets and class results with a PLC.
import React, { useState } from 'react';
import type { FlashcardAssignment, FlashcardSet, Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcs } from '@/hooks/usePlcs';
import {
  deletePlcFlashcardResult,
  loadFlashcardResultSummary,
  writePlcFlashcardResult,
  writePlcFlashcardSetEntry,
} from '@/hooks/usePlcFlashcards';
import { canEditPlcContent, getPlcMemberEmail } from '@/utils/plc';
import { flashcardAssignmentClassLabel } from '@/utils/plcFlashcardResults';
import { PlcShareTargetModal } from '@/components/plc/PlcShareTargetModal';

type Target =
  | { kind: 'set'; set: FlashcardSet }
  | { kind: 'results'; assignment: FlashcardAssignment };

interface Options {
  enabled: boolean;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  setPlcShare: (
    assignmentId: string,
    plcShare: FlashcardAssignment['plcShare']
  ) => Promise<void>;
  /** flashcards-assign-v2: a student check links its session to the PLC's results instead. */
  linkChecks: boolean;
  /** Links a check's session to a PLC (null unlinks). */
  linkCheck: (
    assignment: Pick<FlashcardAssignment, 'sessionId' | 'setId'>,
    plc: Plc | null
  ) => Promise<void>;
}

export const useFlashcardPlcSharing = ({
  enabled,
  addToast,
  setPlcShare,
  linkChecks,
  linkCheck,
}: Options) => {
  const { user } = useAuth();
  const { plcs } = usePlcs({ enabled });
  const [target, setTarget] = useState<Target | null>(null);
  const editablePlcs = user
    ? plcs.filter((plc) => canEditPlcContent(plc, user.uid))
    : [];

  const attribution = (plc: Plc) => ({
    sharedByName: user?.displayName ?? '',
    sharedByEmail:
      (user && getPlcMemberEmail(plc, user.uid)) ??
      (user?.email ? user.email.toLowerCase() : ''),
  });

  type ShareableAssignment = Pick<
    FlashcardAssignment,
    | 'id'
    | 'sessionId'
    | 'setId'
    | 'setTitle'
    | 'periodNames'
    | 'kind'
    | 'audience'
  >;
  const linksCheck = (
    assignment: Pick<FlashcardAssignment, 'kind' | 'audience'>
  ) =>
    linkChecks &&
    assignment.kind === 'check' &&
    assignment.audience !== 'staff';
  const writeResultsShare = async (
    assignment: ShareableAssignment,
    plc: Plc
  ): Promise<void> => {
    if (!user) return;
    if (linksCheck(assignment)) {
      await linkCheck(assignment, plc);
      try {
        await setPlcShare(assignment.id, {
          plcId: plc.id,
          sharedAt: Date.now(),
        });
      } catch (error) {
        await linkCheck(assignment, null).catch(() => undefined);
        throw error;
      }
      return;
    }
    const summary = await loadFlashcardResultSummary(assignment.sessionId);
    const sharedAt = Date.now();
    await writePlcFlashcardResult(plc.id, user.uid, {
      assignmentId: assignment.id,
      setId: assignment.setId,
      setTitle: assignment.setTitle,
      classLabel: flashcardAssignmentClassLabel(assignment),
      summary,
      sharedAt,
      ...attribution(plc),
    });
    await setPlcShare(assignment.id, { plcId: plc.id, sharedAt });
  };

  /** The assign Sharing step: share a new assignment's results; false when it failed. */
  const shareNewAssignmentResults = async (
    assignment: ShareableAssignment,
    plc: Plc
  ): Promise<boolean> => {
    if (!user || !editablePlcs.some((p) => p.id === plc.id)) return false;
    try {
      await writeResultsShare(assignment, plc);
      return true;
    } catch (error) {
      console.warn('[Flashcards] Failed to share results with PLC:', error);
      return false;
    }
  };

  const open = (next: Target): void => {
    if (editablePlcs.length === 0) {
      addToast('Join a PLC to share with teammates.', 'info');
      return;
    }
    setTarget(next);
  };

  const confirm = async (plcId: string): Promise<void> => {
    const plc = editablePlcs.find((p) => p.id === plcId);
    if (!user || !plc || !target) return;
    if (target.kind === 'set') {
      const outcome = await writePlcFlashcardSetEntry(plcId, user.uid, {
        set: target.set,
        ...attribution(plc),
      });
      addToast(
        outcome === 'already-shared'
          ? `“${target.set.title}” is already shared with ${plc.name}.`
          : `“${target.set.title}” shared with ${plc.name}.`,
        outcome === 'already-shared' ? 'info' : 'success'
      );
    } else {
      await writeResultsShare(target.assignment, plc);
      addToast(`Results shared with ${plc.name}.`, 'success');
    }
    setTarget(null);
  };

  /** False when the shared result could not be removed. */
  const stopSharingResults = async (
    assignment: FlashcardAssignment
  ): Promise<boolean> => {
    const share = assignment.plcShare;
    if (!share) return true;
    try {
      // Clear the share first so a pending results sync can't recreate the doc after the delete.
      await setPlcShare(assignment.id, null);
      try {
        // A check may be linked, have a results doc from an older share, or both.
        if (assignment.kind === 'check') await linkCheck(assignment, null);
        await deletePlcFlashcardResult(share.plcId, assignment.id);
      } catch (error) {
        await setPlcShare(assignment.id, share).catch(() => undefined);
        throw error;
      }
      addToast('Results no longer shared.', 'success');
      return true;
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : 'Could not stop sharing.',
        'error'
      );
      return false;
    }
  };

  const modal = target ? (
    <PlcShareTargetModal
      plcs={editablePlcs}
      quizTitle={
        target.kind === 'set'
          ? target.set.title || 'Untitled set'
          : `${target.assignment.setTitle || 'Untitled set'} results`
      }
      onConfirm={confirm}
      onClose={() => setTarget(null)}
    />
  ) : null;

  return {
    enabled,
    editablePlcs,
    shareNewAssignmentResults,
    shareSet: (set: FlashcardSet) => open({ kind: 'set', set }),
    shareResults: (assignment: FlashcardAssignment) =>
      open({ kind: 'results', assignment }),
    stopSharingResults,
    modal,
  };
};
