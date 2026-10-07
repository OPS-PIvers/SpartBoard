/** Built-in team type presets and the page/card catalogs (docs/plans/TEAMS_REDESIGN.md T1, T6). */

import type {
  GoalCoachCriterion,
  PlcGroupType,
  TeamCardId,
  TeamHeroRef,
  TeamHeroRule,
  TeamPageId,
  TeamTypePreset,
} from '@/types';

export const TEAM_TYPE_DEFAULTS_SETTINGS_DOC = 'team_type_defaults';

// Records keep these lists exhaustive: a new id fails to compile until listed.
const PAGE_ID_SET: Record<TeamPageId, true> = {
  dataOverview: true,
  hub: true,
  programHub: true,
  assessments: true,
  docs: true,
  resources: true,
  updates: true,
  workspace: true,
};
export const TEAM_PAGE_IDS = Object.keys(PAGE_ID_SET) as TeamPageId[];

const CARD_ID_SET: Record<TeamCardId, true> = {
  hero: true,
  goals: true,
  nextMeeting: true,
  openItems: true,
  recentAssessments: true,
  distribution: true,
  trend: true,
  participation: true,
  masteryByTarget: true,
  quickLinks: true,
  latestUpdates: true,
  resourcesByCategory: true,
  calendar: true,
  nextTask: true,
  submissionStatus: true,
  recentDocs: true,
  newMaterials: true,
  openDecisions: true,
};
export const TEAM_CARD_IDS = Object.keys(CARD_ID_SET) as TeamCardId[];

const HERO_RULE_SET: Record<TeamHeroRule, true> = {
  latestAssessment: true,
  newestPinnedUpdate: true,
  nextMeetingNote: true,
  nextRequiredTask: true,
};
export const TEAM_HERO_RULES = Object.keys(HERO_RULE_SET) as TeamHeroRule[];

const HERO_REF_KIND_SET: Record<TeamHeroRef['kind'], true> = {
  assessment: true,
  target: true,
  goal: true,
  doc: true,
  note: true,
  update: true,
  calendar: true,
};
export const TEAM_HERO_REF_KINDS = Object.keys(
  HERO_REF_KIND_SET
) as TeamHeroRef['kind'][];

export const isTeamPageId = (v: unknown): v is TeamPageId =>
  typeof v === 'string' && Object.hasOwn(PAGE_ID_SET, v);
export const isTeamCardId = (v: unknown): v is TeamCardId =>
  typeof v === 'string' && Object.hasOwn(CARD_ID_SET, v);
export const isTeamHeroRule = (v: unknown): v is TeamHeroRule =>
  typeof v === 'string' && Object.hasOwn(HERO_RULE_SET, v);

/** Landing pages and the cards each one can show (T18, T24, T26, T34). */
export const TEAM_LANDING_CARD_CATALOG: Partial<
  Record<TeamPageId, readonly TeamCardId[]>
> = {
  dataOverview: [
    'hero',
    'goals',
    'distribution',
    'trend',
    'participation',
    'masteryByTarget',
    'recentAssessments',
    'nextMeeting',
    'openItems',
    'latestUpdates',
    'quickLinks',
    'calendar',
  ],
  hub: [
    'hero',
    'goals',
    'nextMeeting',
    'openDecisions',
    'openItems',
    'recentDocs',
    'newMaterials',
    'quickLinks',
    'latestUpdates',
    'resourcesByCategory',
    'calendar',
  ],
  programHub: [
    'hero',
    'goals',
    'nextTask',
    'submissionStatus',
    'latestUpdates',
    'calendar',
    'resourcesByCategory',
    'quickLinks',
  ],
};

export const isTeamLandingPage = (id: TeamPageId): boolean =>
  TEAM_LANDING_CARD_CATALOG[id] !== undefined;

const PLC_MEETING_TEMPLATE = `## 1. What do we want students to learn?

## 2. How will we know if they have learned it?

## 3. How will we respond when some students do not learn it?

## 4. How will we extend learning for students who already know it?

## Decisions

## Action items
`;

const DEPARTMENT_MEETING_TEMPLATE = `## Agenda

## Curriculum and materials

## Decisions

## Action items
`;

const MENTORING_MEETING_TEMPLATE = `## Check-in

## Goal progress

## Next steps
`;

/** Built-in preset per group type; page order is rail order (Page sets at a glance, T17, T23, T25, T30). */
export const BUILT_IN_TEAM_TYPE_PRESETS: Record<PlcGroupType, TeamTypePreset> =
  {
    plc: {
      pages: [
        { id: 'dataOverview', enabled: true },
        { id: 'assessments', enabled: true },
        { id: 'docs', enabled: true },
        { id: 'resources', enabled: true },
        { id: 'updates', enabled: false },
      ],
      landing: 'dataOverview',
      cards: [
        'hero',
        'goals',
        'distribution',
        'trend',
        'participation',
        'masteryByTarget',
        'recentAssessments',
        'nextMeeting',
        'openItems',
      ],
      heroRule: 'latestAssessment',
      meetingNoteTemplate: PLC_MEETING_TEMPLATE,
    },
    department: {
      pages: [
        { id: 'hub', enabled: true },
        { id: 'docs', enabled: true },
        { id: 'resources', enabled: true },
        { id: 'updates', enabled: false },
      ],
      landing: 'hub',
      cards: [
        'hero',
        'nextMeeting',
        'openDecisions',
        'openItems',
        'recentDocs',
        'newMaterials',
      ],
      heroRule: 'nextMeetingNote',
      meetingNoteTemplate: DEPARTMENT_MEETING_TEMPLATE,
    },
    building: {
      pages: [
        { id: 'hub', enabled: true },
        { id: 'resources', enabled: true },
        { id: 'updates', enabled: true },
        { id: 'docs', enabled: false },
      ],
      landing: 'hub',
      cards: [
        'hero',
        'quickLinks',
        'latestUpdates',
        'resourcesByCategory',
        'calendar',
      ],
      heroRule: 'newestPinnedUpdate',
    },
    mentoring: {
      pages: [
        { id: 'programHub', enabled: true },
        { id: 'workspace', enabled: true },
        { id: 'updates', enabled: true },
        { id: 'resources', enabled: true },
      ],
      landing: 'programHub',
      cards: [
        'hero',
        'nextTask',
        'submissionStatus',
        'latestUpdates',
        'calendar',
        'resourcesByCategory',
      ],
      heroRule: 'nextRequiredTask',
      meetingNoteTemplate: MENTORING_MEETING_TEMPLATE,
    },
  };

/** Pages each type can use: its preset's pages, on or off. */
export const teamTypeAvailablePages = (groupType: PlcGroupType): TeamPageId[] =>
  BUILT_IN_TEAM_TYPE_PRESETS[groupType].pages.map((p) => p.id);

/** Default goal-coach rubric (T22). */
export const DEFAULT_GOAL_COACH_RUBRIC: GoalCoachCriterion[] = [
  {
    id: 'studentFocused',
    label: 'Student-focused',
    description: 'Names what students will achieve, not a task for teachers.',
  },
  {
    id: 'measure',
    label: 'Named measure',
    description: 'Tied to a named assessment or measure.',
  },
  {
    id: 'baselineTarget',
    label: 'Baseline and target',
    description: 'States where students are now and where they will be.',
  },
  {
    id: 'timeFrame',
    label: 'Time frame',
    description: 'Says by when the target will be met.',
  },
  {
    id: 'practice',
    label: 'Practice change',
    description: 'Names a practice the team will change to get there.',
  },
];
