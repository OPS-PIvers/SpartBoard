// Local copy of the B1 page/card/hero contract; switch to the shell's exports once it lands.

import type { ComponentType, ReactNode } from 'react';
import type { Plc, TeamCardId, TeamHeroRef, TeamPageId } from '@/types';
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

/** Optional extras the shell may pass beyond the contract. */
export interface TeamNav {
  onNavigate?: (page: TeamPageId) => void;
  onEditLayout?: () => void;
}

/** Cards owned by other slices (updates, calendar, goals), resolved through the shell's registry. */
export type ForeignCardLookup = (
  id: TeamCardId
) => ComponentType<TeamCardProps> | null;
