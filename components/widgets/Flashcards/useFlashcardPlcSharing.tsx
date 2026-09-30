// Share flashcard sets and class results with a PLC (feature `plc-flashcards`).
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
}

export const useFlashcardPlcSharing = ({
  enabled,
  addToast,
  setPlcShare,
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
      const { assignment } = target;
      const summary = await loadFlashcardResultSummary(assignment.sessionId);
      const sharedAt = Date.now();
      await writePlcFlashcardResult(plcId, user.uid, {
        assignmentId: assignment.id,
        setId: assignment.setId,
        setTitle: assignment.setTitle,
        classLabel: flashcardAssignmentClassLabel(assignment),
        summary,
        sharedAt,
        ...attribution(plc),
      });
      await setPlcShare(assignment.id, { plcId, sharedAt });
      addToast(`Results shared with ${plc.name}.`, 'success');
    }
    setTarget(null);
  };

  /** False when the shared result could not be removed. */
  const stopSharingResults = async (
    assignment: FlashcardAssignment
  ): Promise<boolean> => {
    const plcId = assignment.plcShare?.plcId;
    if (!plcId) return true;
    try {
      await deletePlcFlashcardResult(plcId, assignment.id);
      await setPlcShare(assignment.id, null);
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
    shareSet: (set: FlashcardSet) => open({ kind: 'set', set }),
    shareResults: (assignment: FlashcardAssignment) =>
      open({ kind: 'results', assignment }),
    stopSharingResults,
    modal,
  };
};
