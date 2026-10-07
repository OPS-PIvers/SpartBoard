// Shared contract between the team shell and the pages, cards and heroes other slices register.

import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type {
  Plc,
  PlcGroupType,
  TeamCardId,
  TeamHero,
  TeamHeroRef,
  TeamPageId,
} from '@/types';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';

export interface TeamPageProps {
  plc: Plc;
  layout: ResolvedTeamLayout;
  /** Lead or co-lead. */
  isLead: boolean;
  /** Opens another rail page ("All updates", "All resources"). */
  onNavigate?: (page: TeamPageId) => void;
  /** Lead only: opens the layout editor from a hero's Change button. */
  onChangeHero?: () => void;
}

export interface TeamCardProps {
  plc: Plc;
  isLead: boolean;
  onNavigate?: (page: TeamPageId) => void;
}

/** `heroRef` null means "follow the type's default rule". */
export interface TeamHeroProps {
  plc: Plc;
  heroRef: TeamHeroRef | null;
  /** Set on a pinned hero; renders as "Pinned by {name}". */
  pinnedBy?: TeamHero['pinnedBy'];
  isLead: boolean;
  /** Lead only: opens the layout editor. */
  onChangeHero?: () => void;
}

export type TeamHeroRenderer = (props: TeamHeroProps) => ReactNode;

/** Width of a landing card on a six-column row. */
export type TeamCardSpan = 'full' | 'half' | 'third' | 'twoThirds';

export interface TeamPageEntry {
  icon: LucideIcon;
  /** null renders the neutral placeholder until a slice registers the page. */
  Component: ComponentType<TeamPageProps> | null;
  /** A different page for some team types (the building hub). */
  byType?: Partial<Record<PlcGroupType, ComponentType<TeamPageProps>>>;
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
