/**
 * PlcAssignmentSessionModal — opens the live Monitor or Results view for an
 * in-progress PLC assignment *on top of* the PLC dashboard, instead of the
 * old hand-off that flipped the board's QuizWidget behind the overlay (which
 * forced teachers to close the PLC page to see anything).
 *
 * This file is a thin **shell**: it owns the shared `Modal` wrapper, the
 * `bg-white` light-theme container, and the container-query `size` wrapper
 * that the monitor/results components scale against. The actual data-wiring
 * + presentational rendering lives in one of two sibling content components,
 * picked by `kind`:
 *
 *   - `kind === 'quiz'`            → `PlcQuizSessionContent`
 *   - `kind === 'video-activity'` → `PlcVideoSessionContent`
 *
 * Hooks can't be conditional, so the kind switch selects between two sibling
 * components (each owning its own hooks) rather than branching hooks inline.
 * Both content components reuse this shell's light surface and placeholder
 * states.
 *
 * Only the owner's own assignments reach here (the In-progress sub-tab gates
 * the buttons on `isOwner`), so the teacher gets full session control —
 * advance/pause/resume/end and the per-kind student actions.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PlcAssignmentIndexEntry } from '@/types';
import { Modal } from '@/components/common/Modal';
import { PlcQuizSessionContent } from './PlcQuizSessionContent';
import { PlcVideoSessionContent } from './PlcVideoSessionContent';

interface PlcAssignmentSessionModalProps {
  /** Assignment UUID — also the live quiz/video session doc id. */
  assignmentId: string;
  /** Which kind of assignment this row points at — drives the content child. */
  kind: PlcAssignmentIndexEntry['kind'];
  view: 'monitor' | 'results';
  onClose: () => void;
}

export const PlcAssignmentSessionModal: React.FC<
  PlcAssignmentSessionModalProps
> = ({ assignmentId, kind, view, onClose }) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="bare"
      zIndex="z-modal-nested"
      maxWidth="max-w-6xl"
      ariaLabel={
        view === 'monitor'
          ? t('plcDashboard.assignmentSession.monitorAria', {
              defaultValue: 'Live monitor',
            })
          : t('plcDashboard.assignmentSession.resultsAria', {
              defaultValue: 'Assignment results',
            })
      }
    >
      <div className="w-full h-[88vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* The monitor/results scale with container-query units, so the body
            must establish a `size` container the way DraggableWindow does. */}
        <div className="flex-1 min-h-0" style={{ containerType: 'size' }}>
          {kind === 'video-activity' ? (
            <PlcVideoSessionContent
              assignmentId={assignmentId}
              view={view}
              onClose={onClose}
            />
          ) : (
            <PlcQuizSessionContent
              assignmentId={assignmentId}
              view={view}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
