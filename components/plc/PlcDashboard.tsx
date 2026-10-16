import React from 'react';

import { Plc } from '@/types';
import type { PlcSectionId } from './sections';
import { TeamDashboard } from './teams/shell/TeamDashboard';

interface PlcDashboardProps {
  plc: Plc;
  /** The active section, derived from the pathname by the route host. */
  activeSection: PlcSectionId;
  /** A saved meeting record id, present only on `/plc/:id/meeting/:meetingId`. */
  meetingId?: string | null;
  /** A pooled-results detail id, present only on `/plc/:id/assessments/:assessmentId`. */
  assessmentId?: string | null;
  /** An embedded doc id, present only on `/plc/:id/docs/:docId`. */
  docId?: string | null;
  /** Navigate out of the PLC (back to the prior history entry / the board). */
  onClose: () => void;
}

// Full-screen team page at `/plc/:plcId/:section`.
export const PlcDashboard: React.FC<PlcDashboardProps> = ({
  plc,
  activeSection,
  meetingId = null,
  assessmentId = null,
  docId = null,
  onClose,
}) => (
  <TeamDashboard
    plc={plc}
    activeSection={activeSection}
    meetingId={meetingId}
    assessmentId={assessmentId}
    docId={docId}
    onClose={onClose}
  />
);
