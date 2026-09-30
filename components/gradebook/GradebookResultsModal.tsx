import React from 'react';
import { Modal } from '@/components/common/Modal';
import { PlcQuizSessionContent } from '@/components/plc/assignments/PlcQuizSessionContent';
import { PlcVideoSessionContent } from '@/components/plc/assignments/PlcVideoSessionContent';
import type { GradebookResultsKind } from '@/utils/gradebook/resultsView';
import { GradebookGuidedLearningResultsContent } from './GradebookGuidedLearningResultsContent';

interface GradebookResultsModalProps {
  kind: GradebookResultsKind;
  /** Session id, which is also the quiz and VA assignment id. */
  sessionId: string;
  title: string;
  onClose: () => void;
}

/** The header popover's Results button: the assignment's existing Results view in a large modal. */
export const GradebookResultsModal: React.FC<GradebookResultsModalProps> = ({
  kind,
  sessionId,
  title,
  onClose,
}) => (
  <Modal
    isOpen
    onClose={onClose}
    variant="bare"
    zIndex="z-modal-nested"
    maxWidth="max-w-6xl"
    ariaLabel={`${title} results`}
  >
    <div
      className={`w-full h-[88vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
        kind === 'guided-learning' ? 'bg-slate-900' : 'bg-white'
      }`}
    >
      <div className="flex-1 min-h-0" style={{ containerType: 'size' }}>
        {kind === 'quiz' && (
          <PlcQuizSessionContent
            assignmentId={sessionId}
            view="results"
            onClose={onClose}
          />
        )}
        {kind === 'video-activity' && (
          <PlcVideoSessionContent
            assignmentId={sessionId}
            view="results"
            onClose={onClose}
          />
        )}
        {kind === 'guided-learning' && (
          <GradebookGuidedLearningResultsContent
            sessionId={sessionId}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  </Modal>
);
