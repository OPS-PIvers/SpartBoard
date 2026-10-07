// Shared contract between the team shell and the pages, cards and heroes other slices register.

import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Plc, TeamCardId, TeamHeroRef, TeamPageId } from '@/types';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';

export interface TeamPageProps {
  plc: Plc;
  layout: ResolvedTeamLayout;
  /** Lead or co-lead. */
  isLead: boolean;
}

export interface TeamCardProps {
  plc: Plc;
  isLead: boolean;
}

/** `heroRef` null means "follow the type's default rule". */
export interface TeamHeroProps {
  plc: Plc;
  heroRef: TeamHeroRef | null;
  isLead: boolean;
}

export type TeamHeroRenderer = (props: TeamHeroProps) => ReactNode;

/** Width of a landing card on a six-column row. */
export type TeamCardSpan = 'full' | 'half' | 'third' | 'twoThirds';

export interface TeamPageEntry {
  icon: LucideIcon;
  /** null renders the neutral placeholder until a slice registers the page. */
  Component: ComponentType<TeamPageProps> | null;
  /** Page paints its own edges and scroll regions. */
  fullBleed?: boolean;
}

export interface TeamCardEntry {
  /** null renders the neutral placeholder until a slice registers the card. */
  Component: ComponentType<TeamCardProps> | null;
  span: TeamCardSpan;
}

export type TeamPageRegistry = Record<TeamPageId, TeamPageEntry>;
export type TeamCardRegistry = Record<TeamCardId, TeamCardEntry>;

export interface TeamHeroEntry {
  render: TeamHeroRenderer;
  /** The renderer shows the newer-data nudge itself (see `heroes/useHeroStaleness`). */
  ownsNudge?: boolean;
}
