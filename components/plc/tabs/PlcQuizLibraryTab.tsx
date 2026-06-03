import React from 'react';
import { Plc } from '@/types';
import { PlcQuizzesBody } from '@/components/plc/bodies/PlcQuizzesBody';

interface PlcQuizLibraryTabProps {
  plc: Plc;
  /**
   * Closes the entire PLC dashboard. Forwarded to the body so its post-
   * assign "Edit all settings…" hand-off from the class-period picker can
   * dismiss the dashboard before the QuizWidget opens the full assignment
   * editor.
   */
  onCloseDashboard: () => void;
}

/**
 * Tab-mode wrapper around the shared `PlcQuizzesBody`. The body owns the
 * Library / In-progress / Completed sub-tab shell and all editor state, and
 * this tab is a placement-only shim used by the legacy v1 dashboard section
 * routing.
 */
export const PlcQuizLibraryTab: React.FC<PlcQuizLibraryTabProps> = ({
  plc,
  onCloseDashboard,
}) => {
  return <PlcQuizzesBody plc={plc} onCloseDashboard={onCloseDashboard} />;
};
