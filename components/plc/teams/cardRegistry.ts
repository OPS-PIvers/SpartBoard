// Landing card registry (T2, T18, T24, T26, T34): slices register a card with one line each.

import {
  DistributionCard,
  GoalsCard,
  MasteryByTargetCard,
  ParticipationCard,
  RecentAssessmentsCard,
  TrendCard,
} from './data/landingCards';
import LatestUpdatesCard from './updates/LatestUpdatesCard';
import QuickLinksCard from './building/QuickLinksCard';
import ResourcesByCategoryCard from './building/ResourcesByCategoryCard';
import CalendarCard from './building/CalendarCard';
import NextTaskCard from './mentoring/NextTaskCard';
import SubmissionStatusCard from './mentoring/SubmissionStatusCard';
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
  quickLinks: { Component: QuickLinksCard, span: 'third' },
  latestUpdates: { Component: LatestUpdatesCard, span: 'twoThirds' },
  resourcesByCategory: {
    Component: ResourcesByCategoryCard,
    span: 'twoThirds',
  },
  calendar: { Component: CalendarCard, span: 'third' },
  nextTask: { Component: NextTaskCard, span: 'full' },
  submissionStatus: { Component: SubmissionStatusCard, span: 'half' },
  recentDocs: { Component: null, span: 'half' },
  newMaterials: { Component: null, span: 'half' },
  openDecisions: { Component: null, span: 'full' },
};
