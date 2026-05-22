import React from 'react';
import { Plc } from '@/types';
import { PlcQuizLibraryBody } from '../bodies/PlcQuizLibraryBody';

interface PlcQuizLibraryTabProps {
  plc: Plc;
  /**
   * Closes the entire PLC dashboard. Forwarded to the body so its post-
   * assign "Edit all settings…" hand-off from the class-period picker can
   * dismiss the dashboard before the QuizWidget opens the full assignment
   * editor. Mirrors `PlcAssignmentsTab`.
   */
  onCloseDashboard: () => void;
}

/**
 * Tab-mode wrapper around the shared `PlcQuizLibraryBody`. Mirrors the
 * `PlcNotesTab` shape from Phase 2 — the body owns all editor state,
 * hooks, and chrome, and this tab is now a placement-only shim used by
 * the legacy v1 dashboard tab routing. The v2 grid renders
 * `PlcQuizLibraryBody` directly inside a tile (or its fullscreen
 * expansion).
 */
export const PlcQuizLibraryTab: React.FC<PlcQuizLibraryTabProps> = ({
  plc,
  onCloseDashboard,
}) => {
  return <PlcQuizLibraryBody plc={plc} onCloseDashboard={onCloseDashboard} />;
};
