// Landing card registry (T2, T18, T24, T26, T34): slices register a card with one line each.

import {
  DistributionCard,
  GoalsCard,
  MasteryByTargetCard,
  ParticipationCard,
  RecentAssessmentsCard,
  TrendCard,
} from './data/landingCards';
import type { TeamCardRegistry } from './types';

/** Landing cards; `Component: null` renders the neutral placeholder. */
export const TEAM_CARD_REGISTRY: TeamCardRegistry = {
  hero: { Component: null, span: 'full' },
  goals: { Component: GoalsCard, span: 'third' },
  nextMeeting: { Component: null, span: 'third' },
  openItems: { Component: null, span: 'third' },
  recentAssessments: { Component: RecentAssessmentsCard, span: 'twoThirds' },
  distribution: { Component: DistributionCard, span: 'third' },
  trend: { Component: TrendCard, span: 'third' },
  participation: { Component: ParticipationCard, span: 'third' },
  masteryByTarget: { Component: MasteryByTargetCard, span: 'full' },
  quickLinks: { Component: null, span: 'third' },
  latestUpdates: { Component: null, span: 'twoThirds' },
  resourcesByCategory: { Component: null, span: 'twoThirds' },
  calendar: { Component: null, span: 'third' },
  nextTask: { Component: null, span: 'full' },
  submissionStatus: { Component: null, span: 'half' },
  recentDocs: { Component: null, span: 'half' },
  newMaterials: { Component: null, span: 'half' },
  openDecisions: { Component: null, span: 'full' },
};
