import type React from 'react';

// Slot stub: the gradebook slice that owns this file replaces the body and keeps the props.
export interface GradebookAnalyzeModalProps {
  sessionId: string;
  onClose: () => void;
}

export const GradebookAnalyzeModal: React.FC<GradebookAnalyzeModalProps> = () =>
  null;
