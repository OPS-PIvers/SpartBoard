// Hero renderers by pinned item kind and by the type's default rule (T5, T6); slices add one line each.

import type { PlcGroupType, TeamHeroRef, TeamHeroRule } from '@/types';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import type { TeamHeroEntry } from '@/components/plc/teams/types';

/** A pinned item renders through its kind. */
export const TEAM_HERO_BY_KIND: Partial<
  Record<TeamHeroRef['kind'], TeamHeroEntry>
> = {};

/** An unpinned hero renders through the type's default rule, with `heroRef: null`. */
export const TEAM_HERO_BY_RULE: Partial<Record<TeamHeroRule, TeamHeroEntry>> =
  {};

// Rules whose hero is a kind's renderer with `heroRef: null` (that renderer picks the item; read the rule from useTeamNav().layout).
const RULE_KIND: Partial<Record<string, TeamHeroRef['kind']>> = {
  teamGoal: 'goal',
  lowestTarget: 'target',
  newestDoc: 'doc',
  calendar: 'calendar',
};

/** An unknown or unregistered rule falls back to the type's built-in rule. */
export function resolveTeamHeroEntry(
  heroRef: TeamHeroRef | null,
  rule: TeamHeroRule,
  groupType: PlcGroupType
): TeamHeroEntry | null {
  if (heroRef) return TEAM_HERO_BY_KIND[heroRef.kind] ?? null;
  return (
    TEAM_HERO_BY_RULE[rule] ??
    kindEntry(RULE_KIND[rule]) ??
    TEAM_HERO_BY_RULE[BUILT_IN_TEAM_TYPE_PRESETS[groupType].heroRule] ??
    null
  );
}

function kindEntry(
  kind: TeamHeroRef['kind'] | undefined
): TeamHeroEntry | null {
  return kind ? (TEAM_HERO_BY_KIND[kind] ?? null) : null;
}
