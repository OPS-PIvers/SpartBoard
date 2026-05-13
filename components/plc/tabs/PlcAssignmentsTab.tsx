import React from 'react';
import { Plc } from '@/types';
import { PlcAssignmentsBody } from '../bodies/PlcAssignmentsBody';

interface PlcAssignmentsTabProps {
  plc: Plc;
  /**
   * Closes the entire PLC dashboard. Forwarded down to the Library
   * sub-tab so its "Edit all settings…" hand-off from the post-import
   * class-period picker can dismiss the dashboard before the QuizWidget
   * opens the full assignment editor.
   */
  onCloseDashboard: () => void;
}

/**
 * Tab-mode wrapper around the shared `PlcAssignmentsBody`. Mirrors the
 * `PlcNotesTab` / `PlcQuizLibraryTab` shape — the body owns the
 * 3-sub-tab state and chrome, and this tab is now a placement-only shim
 * used by the legacy v1 dashboard tab routing. The v2 grid renders
 * `PlcAssignmentsBody` directly inside a tile (or its fullscreen
 * expansion).
 */
export const PlcAssignmentsTab: React.FC<PlcAssignmentsTabProps> = ({
  plc,
  onCloseDashboard,
}) => {
  return <PlcAssignmentsBody plc={plc} onCloseDashboard={onCloseDashboard} />;
};
