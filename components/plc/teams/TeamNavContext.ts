// Route params and navigation the team shell hands to registered pages, cards and heroes.

import { createContext, useContext } from 'react';
import type { PlcSectionId } from '@/components/plc/sections';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';

export interface TeamNav {
  navigate: (section: PlcSectionId) => void;
  openDoc: (docId: string) => void;
  close: () => void;
  /** Lead and co-lead only; a no-op for everyone else. */
  openLayoutEditor: () => void;
  assessmentId: string | null;
  docId: string | null;
  /** A saved meeting record from an old `/meeting/:id` link; Notes & Docs opens it. */
  meetingId: string | null;
  /** The team's resolved layout, e.g. for a hero following the default rule. */
  layout: ResolvedTeamLayout | null;
}

const NOOP_NAV: TeamNav = {
  navigate: () => undefined,
  openDoc: () => undefined,
  close: () => undefined,
  openLayoutEditor: () => undefined,
  assessmentId: null,
  docId: null,
  meetingId: null,
  layout: null,
};

export const TeamNavContext = createContext<TeamNav>(NOOP_NAV);

export function useTeamNav(): TeamNav {
  return useContext(TeamNavContext);
}
