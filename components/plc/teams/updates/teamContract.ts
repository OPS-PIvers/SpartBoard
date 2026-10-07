// Local copy of the shell's page/card/hero contract until slice B1's pageRegistry merges; swap to its exports then.

import type { Plc, TeamHeroRef, TeamPageId } from '@/types';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';

export interface TeamPageProps {
  plc: Plc;
  layout: ResolvedTeamLayout;
  isLead: boolean;
  /** Not in B1's contract yet: opens another rail page ("All updates", "All resources"). */
  onNavigate?: (page: TeamPageId) => void;
  /** Not in B1's contract yet: opens the layout editor from the hero's Change button. */
  onChangeHero?: () => void;
}

export interface TeamCardProps {
  plc: Plc;
  isLead: boolean;
  onNavigate?: (page: TeamPageId) => void;
}

export interface TeamHeroProps {
  plc: Plc;
  heroRef: TeamHeroRef | null;
  isLead: boolean;
  onChangeHero?: () => void;
}
