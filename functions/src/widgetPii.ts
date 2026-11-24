// Server mirror of PII_WIDGET_FIELDS and widgetPiiKeys in utils/dashboardPII.ts; tests/mcpBoardSharePII.test.ts keeps them equal.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
type Doc = Record<string, unknown>;

export const PII_WIDGET_FIELDS = [
  'firstNames',
  'lastNames',
  'completedNames',
  'remainingStudents',
  'lastResult',
  'lockedNames',
  'unassignedNames',
  'doneNames',
  'jigsawHomeGroups',
  'jigsawExpertGroups',
  'recentGroupings',
  'names',
  'roster',
  'customRoster',
  'lastSubmittedDetails',
] as const;

const ROSTER_ID =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[\w-]*\d)[\w-]{16,})$/i;
const NAME_KEYED_TYPES = new Set(['stations', 'lunchCount', 'seating-chart']);
const QUIZ_TEAM_ID = /^(?:pin|uid)-/;

const hasNameKeys = (map: unknown): boolean =>
  isRecord(map) && Object.keys(map).some((key) => !ROSTER_ID.test(key));

export const piiKeys = (type: string, config: Doc): string[] => {
  const keys: string[] = [...PII_WIDGET_FIELDS];
  const custom = config.rosterMode === 'custom';
  if (
    config.assignments !== undefined &&
    (custom || (NAME_KEYED_TYPES.has(type) && hasNameKeys(config.assignments)))
  )
    keys.push('assignments');
  if (
    type === 'seating-chart' &&
    Array.isArray(config.savedPlans) &&
    config.savedPlans.some(
      (plan: unknown) =>
        isRecord(plan) && (custom || hasNameKeys(plan.assignments))
    )
  )
    keys.push('savedPlans');
  if (type === 'scoreboard') {
    if (
      Array.isArray(config.teams) &&
      config.teams.some(
        (team: unknown) =>
          isRecord(team) &&
          QUIZ_TEAM_ID.test(typeof team.id === 'string' ? team.id : '')
      )
    )
      keys.push('teams', 'history');
    else if (
      Array.isArray(config.history) &&
      config.history.some(
        (entry: unknown) =>
          isRecord(entry) &&
          Array.isArray(entry.changes) &&
          entry.changes.some(
            (change: unknown) =>
              isRecord(change) &&
              QUIZ_TEAM_ID.test(
                typeof change.teamId === 'string' ? change.teamId : ''
              )
          )
      )
    )
      keys.push('history');
  }
  return keys;
};
