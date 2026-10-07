// Landing card rows the layout editor lists per type, in the mock's order; one row can cover two cards.

import type { PlcGroupType, TeamCardId } from '@/types';

export const TEAM_CARD_ROWS: Record<
  PlcGroupType,
  readonly (readonly TeamCardId[])[]
> = {
  plc: [
    ['distribution'],
    ['trend'],
    ['participation'],
    ['masteryByTarget'],
    ['goals'],
    ['recentAssessments'],
    ['nextMeeting', 'openItems'],
    ['latestUpdates'],
    ['calendar'],
  ],
  department: [
    ['nextMeeting'],
    ['openDecisions', 'openItems'],
    ['recentDocs'],
    ['newMaterials'],
    ['goals'],
    ['latestUpdates'],
    ['calendar'],
  ],
  building: [
    ['quickLinks'],
    ['latestUpdates'],
    ['resourcesByCategory'],
    ['calendar'],
    ['goals'],
  ],
  mentoring: [
    ['nextTask'],
    ['submissionStatus'],
    ['latestUpdates'],
    ['calendar'],
    ['resourcesByCategory'],
    ['goals'],
  ],
};
