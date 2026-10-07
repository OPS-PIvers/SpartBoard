// Display names for team pages, landing cards, hero rules and types (approved wording list).

import type { TFunction } from 'i18next';
import type {
  PlcGroupType,
  TeamCardId,
  TeamHeroRef,
  TeamHeroRule,
  TeamPageId,
} from '@/types';

const PAGE_LABELS: Record<TeamPageId, string> = {
  dataOverview: 'Data overview',
  hub: 'Hub',
  programHub: 'Program Hub',
  assessments: 'Assessments',
  docs: 'Notes & Docs',
  resources: 'Resources',
  updates: 'Updates',
  workspace: 'Workspace',
};

/** Rail and editor name of a page; facilitators see "Workspaces" (T30). */
export function teamPageLabel(
  t: TFunction,
  id: TeamPageId,
  isLead = false
): string {
  if (id === 'workspace' && isLead) {
    return t('teams.pages.workspaces', { defaultValue: 'Workspaces' });
  }
  return t(`teams.pages.${id}`, { defaultValue: PAGE_LABELS[id] });
}

const CARD_LABELS: Record<TeamCardId, string> = {
  hero: 'First thing the team sees',
  goals: 'Goals',
  nextMeeting: 'Next meeting',
  openItems: 'Open items',
  recentAssessments: 'Recent assessments',
  distribution: 'Score distribution',
  trend: 'Team average over time',
  participation: 'Participation',
  masteryByTarget: 'Mastery by learning target',
  quickLinks: 'Quick links',
  latestUpdates: 'Latest updates',
  resourcesByCategory: 'Resources by category',
  calendar: 'Calendar',
  nextTask: 'Your next task',
  submissionStatus: 'Submission status',
  recentDocs: 'Recently updated docs',
  newMaterials: 'Newly shared materials',
  openDecisions: 'Open decisions and action items',
};

const CARD_LABELS_BY_TYPE: Partial<
  Record<PlcGroupType, Partial<Record<TeamCardId, string>>>
> = {
  department: { nextMeeting: 'Next meeting note' },
  mentoring: { calendar: 'Program dates', resourcesByCategory: 'Resources' },
};

export function teamCardLabel(
  t: TFunction,
  id: TeamCardId,
  groupType: PlcGroupType
): string {
  const label = CARD_LABELS_BY_TYPE[groupType]?.[id] ?? CARD_LABELS[id];
  const key = CARD_LABELS_BY_TYPE[groupType]?.[id]
    ? `teams.cards.${groupType}.${id}`
    : `teams.cards.${id}`;
  return t(key, { defaultValue: label });
}

// Partial so rule ids added later still compile; they label as their built-in fallback.
const HERO_RULE_LABELS: Partial<Record<TeamHeroRule, string>> = {
  latestAssessment: 'Latest common assessment',
  newestPinnedUpdate: 'Newest pinned update',
  nextMeetingNote: 'Next meeting note until a doc is pinned',
  nextRequiredTask: 'Next required task',
};

export function teamHeroRuleLabel(t: TFunction, rule: TeamHeroRule): string {
  return t(`teams.heroRules.${rule}`, {
    defaultValue: HERO_RULE_LABELS[rule] ?? HERO_RULE_LABELS.latestAssessment,
  });
}

/** Under "Follow default" in the layout editor. */
export function teamHeroRuleSummary(t: TFunction, rule: TeamHeroRule): string {
  if (rule === 'latestAssessment') {
    return t('teams.layout.followsLatestAssessment', {
      defaultValue: 'Shows the latest common assessment.',
    });
  }
  return teamHeroRuleLabel(t, rule);
}

const HERO_KIND_LABELS: Record<TeamHeroRef['kind'], string> = {
  assessment: 'Assessment results',
  target: 'Learning target trend',
  goal: 'Goals',
  doc: 'Notes & Docs',
  note: 'Notes & Docs',
  update: 'Updates',
  calendar: 'Calendar',
};

export function teamHeroKindLabel(
  t: TFunction,
  kind: TeamHeroRef['kind']
): string {
  return t(`teams.heroKinds.${kind}`, {
    defaultValue: HERO_KIND_LABELS[kind],
  });
}

const TYPE_LABELS: Record<PlcGroupType, string> = {
  plc: 'PLC',
  department: 'Department',
  building: 'Building',
  mentoring: 'Mentoring program',
};

/** Team type next to the name in the header. */
export function teamTypeLabel(t: TFunction, type: PlcGroupType): string {
  return t(`teams.types.${type}`, { defaultValue: TYPE_LABELS[type] });
}
