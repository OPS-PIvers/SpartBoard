// Hero renderers by pinned item kind and by the type's default rule (T5, T6); slices add one line each.

import type { TeamHeroRef, TeamHeroRule } from '@/types';
import type { TeamHeroEntry } from '@/components/plc/teams/types';

/** A pinned item renders through its kind. */
export const TEAM_HERO_BY_KIND: Partial<
  Record<TeamHeroRef['kind'], TeamHeroEntry>
> = {};

/** An unpinned hero renders through the type's default rule, with `heroRef: null`. */
export const TEAM_HERO_BY_RULE: Partial<Record<TeamHeroRule, TeamHeroEntry>> =
  {};

export function resolveTeamHeroEntry(
  heroRef: TeamHeroRef | null,
  rule: TeamHeroRule
): TeamHeroEntry | null {
  return (
    (heroRef ? TEAM_HERO_BY_KIND[heroRef.kind] : TEAM_HERO_BY_RULE[rule]) ??
    null
  );
}
