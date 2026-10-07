// Page and card contract shared by the team-page slices; switch to the shell's exports once it lands.

import type { Plc } from '@/types';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';

export interface TeamPageProps {
  plc: Plc;
  layout: ResolvedTeamLayout;
  isLead: boolean;
}

export interface TeamCardProps {
  plc: Plc;
  isLead: boolean;
}
