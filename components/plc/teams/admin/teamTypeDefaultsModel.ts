/** Editable form of one team type preset and the goal-coach rubric (TEAMS_REDESIGN T3, T12, T22). */

import type {
  GoalCoachCriterion,
  PlcGroupType,
  TeamCardId,
  TeamHeroRule,
  TeamPageId,
  TeamPageSetting,
  TeamTypePreset,
} from '@/types';
import {
  BUILT_IN_TEAM_TYPE_PRESETS,
  TEAM_LANDING_CARD_CATALOG,
} from '@/config/teamTypePresets';
import {
  DEFAULT_GOAL_COACH_RUBRIC,
  GOAL_COACH_MAX_CRITERIA,
} from '@/config/goalCoachRubric';
import {
  parseMeetingNoteTemplate,
  serializeMeetingNoteTemplate,
  type MeetingNoteBlockKind,
  type MeetingNoteTemplateSection,
} from '@/utils/meetingNoteTemplate';
import { sanitizeTeamTypePreset } from '@/utils/teamLayout';

export const TEAM_TYPE_ORDER: readonly PlcGroupType[] = [
  'plc',
  'department',
  'building',
  'mentoring',
];

export const TEAM_TYPE_LABELS: Record<PlcGroupType, string> = {
  plc: 'PLC',
  department: 'Department',
  building: 'Building',
  mentoring: 'Mentoring',
};

export const TEAM_PAGE_LABELS: Record<TeamPageId, string> = {
  dataOverview: 'Data overview',
  hub: 'Hub',
  programHub: 'Program Hub',
  assessments: 'Assessments',
  docs: 'Notes & Docs',
  resources: 'Resources',
  updates: 'Updates',
  workspace: 'Workspace',
};

export const BLOCK_KIND_LABELS: Record<MeetingNoteBlockKind, string> = {
  text: 'Text',
  data: 'Data',
  decision: 'Decision',
  actionItems: 'Action items',
};

export const HERO_RULE_LABELS: Record<TeamHeroRule, string> = {
  latestAssessment: 'Latest common assessment',
  teamGoal: 'Team goal',
  lowestTarget: 'Lowest learning target',
  nextMeetingNote: 'Next meeting note until a doc is pinned',
  newestDoc: 'Newest doc',
  newestPinnedUpdate: 'Newest pinned update',
  calendar: 'Calendar',
  nextRequiredTask: 'Next required task',
};

/** Hero rules offered per type, in the mock's order. */
export const HERO_RULE_OPTIONS: Record<PlcGroupType, readonly TeamHeroRule[]> =
  {
    plc: ['latestAssessment', 'teamGoal', 'lowestTarget'],
    department: ['nextMeetingNote', 'newestDoc'],
    building: ['newestPinnedUpdate', 'calendar'],
    mentoring: ['nextRequiredTask', 'newestPinnedUpdate'],
  };

interface CardRowDef {
  key: string;
  label: string;
  ids: readonly TeamCardId[];
}

const row = (label: string, ...ids: TeamCardId[]): CardRowDef => ({
  key: ids.join('+'),
  label,
  ids,
});

/** Landing card rows per type, in the mock's default order; one row can cover two cards. */
export const CARD_ROWS: Record<PlcGroupType, readonly CardRowDef[]> = {
  plc: [
    row('Score distribution', 'distribution'),
    row('Team average over time', 'trend'),
    row('Participation', 'participation'),
    row('Mastery by learning target', 'masteryByTarget'),
    row('Goals', 'goals'),
    row('Recent assessments', 'recentAssessments'),
    row('Next meeting and open items', 'nextMeeting', 'openItems'),
    row('Latest updates', 'latestUpdates'),
    row('Calendar', 'calendar'),
  ],
  department: [
    row('Next meeting note', 'nextMeeting'),
    row('Open decisions and action items', 'openDecisions', 'openItems'),
    row('Recently updated docs', 'recentDocs'),
    row('Newly shared materials', 'newMaterials'),
    row('Goals', 'goals'),
    row('Latest updates', 'latestUpdates'),
    row('Calendar', 'calendar'),
  ],
  building: [
    row('Quick links', 'quickLinks'),
    row('Latest updates', 'latestUpdates'),
    row('Resources by category', 'resourcesByCategory'),
    row('Calendar', 'calendar'),
    row('Goals', 'goals'),
  ],
  mentoring: [
    row('Your next task', 'nextTask'),
    row('Submission status', 'submissionStatus'),
    row('Latest updates', 'latestUpdates'),
    row('Program dates', 'calendar'),
    row('Resources', 'resourcesByCategory'),
    row('Goals', 'goals'),
  ],
};

export interface CardRowState {
  key: string;
  label: string;
  ids: readonly TeamCardId[];
  on: boolean;
}

export interface PresetDraft {
  pages: TeamPageSetting[];
  landing: TeamPageId;
  cards: CardRowState[];
  /** Cards outside the rows (the hero and any extra catalog card), kept as saved. */
  fixedCards: TeamCardId[];
  heroRule: TeamHeroRule;
  templatePreamble: string;
  template: MeetingNoteTemplateSection[];
  categories: string[];
}

export function draftFromPreset(
  preset: TeamTypePreset,
  type: PlcGroupType
): PresetDraft {
  const defs = CARD_ROWS[type];
  const covered = new Set(defs.flatMap((d) => d.ids));
  const position = (d: CardRowDef) =>
    Math.min(
      ...d.ids.map((id) => {
        const i = preset.cards.indexOf(id);
        return i < 0 ? Infinity : i;
      })
    );
  const on = defs
    .filter((d) => position(d) !== Infinity)
    .sort((a, b) => position(a) - position(b));
  const off = defs.filter((d) => position(d) === Infinity);
  const template = parseMeetingNoteTemplate(preset.meetingNoteTemplate);
  return {
    pages: preset.pages.map((p) => ({ ...p })),
    landing: preset.landing,
    cards: [
      ...on.map((d) => ({ ...d, on: true })),
      ...off.map((d) => ({ ...d, on: false })),
    ],
    fixedCards: preset.cards.filter((c) => !covered.has(c)),
    heroRule: preset.heroRule,
    templatePreamble: template.preamble,
    template: template.sections,
    categories: [...(preset.resourceCategories ?? [])],
  };
}

/** The stored preset for a draft, sanitized the same way readers sanitize it. */
export function presetFromDraft(
  draft: PresetDraft,
  type: PlcGroupType
): TeamTypePreset {
  const catalog = TEAM_LANDING_CARD_CATALOG[draft.landing] ?? [];
  const fixed = draft.fixedCards.filter((c) => catalog.includes(c));
  const hero = fixed.filter((c) => c === 'hero');
  const extra = fixed.filter((c) => c !== 'hero');
  const cards = [
    ...hero,
    ...draft.cards.filter((c) => c.on).flatMap((c) => c.ids),
    ...extra,
  ];
  const raw = {
    pages: draft.pages,
    landing: draft.landing,
    cards,
    heroRule: draft.heroRule,
    meetingNoteTemplate: serializeMeetingNoteTemplate({
      preamble: draft.templatePreamble,
      sections: draft.template,
    }),
    resourceCategories: draft.categories,
  };
  return sanitizeTeamTypePreset(raw, type);
}

/** Firestore rejects undefined, so optional fields are written as empty values. */
export function presetToFirestore(
  preset: TeamTypePreset
): Record<string, unknown> {
  return {
    pages: preset.pages.map((p) => ({ id: p.id, enabled: p.enabled })),
    landing: preset.landing,
    cards: [...preset.cards],
    heroRule: preset.heroRule,
    meetingNoteTemplate: preset.meetingNoteTemplate ?? '',
    resourceCategories: preset.resourceCategories ?? [],
  };
}

export const builtInDraft = (type: PlcGroupType): PresetDraft =>
  draftFromPreset(BUILT_IN_TEAM_TYPE_PRESETS[type], type);

export interface RubricDraftRow {
  /** Unset for a criterion added in this editor. */
  id?: string;
  label: string;
  /** The label as loaded; a changed label replaces the description too. */
  baseLabel?: string;
  description?: string;
}

export const rubricDraftFrom = (
  rubric: readonly GoalCoachCriterion[] | undefined
): RubricDraftRow[] =>
  (rubric ?? DEFAULT_GOAL_COACH_RUBRIC).map((c) => ({
    id: c.id,
    label: c.label,
    baseLabel: c.label,
    description: c.description,
  }));

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');

/** Criteria as the server reads them: id slug, label, non-empty description, at most the max. */
export function rubricFromDraft(rows: RubricDraftRow[]): GoalCoachCriterion[] {
  const used = new Set<string>();
  const out: GoalCoachCriterion[] = [];
  for (const r of rows) {
    const label = r.label.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label) continue;
    let id = r.id && ID_RE.test(r.id) && !used.has(r.id) ? r.id : slug(label);
    if (!ID_RE.test(id) || used.has(id)) {
      let n = out.length + 1;
      while (used.has(`criterion-${n}`)) n++;
      id = `criterion-${n}`;
    }
    used.add(id);
    const keepDescription =
      r.baseLabel !== undefined &&
      label === r.baseLabel.trim() &&
      !!r.description?.trim();
    out.push({
      id,
      label,
      description: keepDescription ? (r.description ?? label) : label,
    });
    if (out.length === GOAL_COACH_MAX_CRITERIA) break;
  }
  return out;
}

export const isDefaultRubric = (rubric: GoalCoachCriterion[]): boolean =>
  rubric.length === DEFAULT_GOAL_COACH_RUBRIC.length &&
  rubric.every((c, i) => {
    const d = DEFAULT_GOAL_COACH_RUBRIC[i];
    return (
      c.id === d.id && c.label === d.label && c.description === d.description
    );
  });
