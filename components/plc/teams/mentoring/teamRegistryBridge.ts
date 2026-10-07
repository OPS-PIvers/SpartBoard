// Cards and heroes owned by other slices, registered by the shell's page registry to avoid a circular import.

import type { ComponentType } from 'react';
import type { TeamCardId, TeamHeroRef, TeamPageId } from '@/types';
import { spaNavigate } from '@/utils/plcPath';
import type {
  TeamCardProps,
  TeamHeroProps,
} from '@/components/plc/teams/types';

export type ForeignCardLookup = (
  id: TeamCardId
) => ComponentType<TeamCardProps> | null;

let cardLookup: ForeignCardLookup = () => null;
let heroLookup: (
  kind: TeamHeroRef['kind']
) => ComponentType<TeamHeroProps> | null = () => null;

export function registerMentoringForeignViews(views: {
  card?: ForeignCardLookup;
  hero?: (kind: TeamHeroRef['kind']) => ComponentType<TeamHeroProps> | null;
}): void {
  if (views.card) cardLookup = views.card;
  if (views.hero) heroLookup = views.hero;
}

export const foreignCard = (
  id: TeamCardId
): ComponentType<TeamCardProps> | null => cardLookup(id);

export const foreignHero = (
  kind: TeamHeroRef['kind']
): ComponentType<TeamHeroProps> | null => heroLookup(kind);

/** Fallback when the shell passes no navigation callback. */
export function goToTeamPage(plcId: string, page: TeamPageId): void {
  spaNavigate(`/plc/${encodeURIComponent(plcId)}/${page}`);
}
