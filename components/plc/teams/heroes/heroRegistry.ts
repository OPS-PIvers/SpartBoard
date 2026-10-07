// Hero renderers by pinned item kind and by the type's default rule (T5, T6); slices add one line each.

import type { PlcGroupType, TeamHeroRef, TeamHeroRule } from '@/types';
import {
  BUILT_IN_TEAM_TYPE_PRESETS,
  isTeamHeroRule,
} from '@/config/teamTypePresets';
import type { TeamHeroEntry } from '@/components/plc/teams/types';
import {
  assessmentHero,
  goalHero,
  latestAssessmentHero,
  targetHero,
} from '@/components/plc/teams/data/heroRegistry';

/** A pinned item renders through its kind. */
export const TEAM_HERO_BY_KIND: Partial<
  Record<TeamHeroRef['kind'], TeamHeroEntry>
> = {
  assessment: { render: assessmentHero, ownsNudge: true },
  target: { render: targetHero },
  goal: { render: goalHero },
};

/** An unpinned hero renders through the type's default rule, with `heroRef: null`. */
export const TEAM_HERO_BY_RULE: Partial<Record<TeamHeroRule, TeamHeroEntry>> = {
  latestAssessment: { render: latestAssessmentHero, ownsNudge: true },
};

/** Rules whose hero is a kind's renderer with `heroRef: null`; that renderer picks the item (read the rule from useTeamNav().layout). */
export function teamHeroRuleKind(
  rule: TeamHeroRule
): TeamHeroRef['kind'] | null {
  switch (rule) {
    case 'latestAssessment':
    case 'newestPinnedUpdate':
    case 'nextMeetingNote':
    case 'nextRequiredTask':
      return null;
    case 'teamGoal':
      return 'goal';
    case 'lowestTarget':
      return 'target';
    case 'newestDoc':
      return 'doc';
    case 'calendar':
      return 'calendar';
    default: {
      const unhandled: never = rule;
      return unhandled;
    }
  }
}

/** Null renders the neutral placeholder; an unknown rule falls back to the type's built-in rule. */
export function resolveTeamHeroEntry(
  heroRef: TeamHeroRef | null,
  rule: TeamHeroRule,
  groupType: PlcGroupType
): TeamHeroEntry | null {
  if (heroRef) return TEAM_HERO_BY_KIND[heroRef.kind] ?? null;
  if (!isTeamHeroRule(rule)) {
    return (
      TEAM_HERO_BY_RULE[BUILT_IN_TEAM_TYPE_PRESETS[groupType].heroRule] ?? null
    );
  }
  const kind = teamHeroRuleKind(rule);
  return (
    TEAM_HERO_BY_RULE[rule] ?? (kind ? TEAM_HERO_BY_KIND[kind] : null) ?? null
  );
}
