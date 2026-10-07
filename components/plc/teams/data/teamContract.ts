// Local copy of the B1 page/card/hero contract; switch to components/plc/teams/pageRegistry exports once B1 merges.

import type { ReactNode } from 'react';
import type { Plc, TeamHeroRef } from '@/types';
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

export interface TeamHeroProps {
  plc: Plc;
  heroRef: TeamHeroRef | null;
  isLead: boolean;
}

export type TeamHeroRenderer = (props: TeamHeroProps) => ReactNode;
