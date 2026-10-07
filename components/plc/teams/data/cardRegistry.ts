// Landing cards this slice owns, keyed for the B1 card registry.

import type { ComponentType } from 'react';
import type { TeamCardId } from '@/types';
import {
  DistributionCard,
  GoalsCard,
  MasteryByTargetCard,
  ParticipationCard,
  RecentAssessmentsCard,
  TrendCard,
} from './landingCards';
import type { TeamCardProps } from '@/components/plc/teams/types';

export const DATA_OVERVIEW_CARDS: Partial<
  Record<TeamCardId, ComponentType<TeamCardProps>>
> = {
  distribution: DistributionCard,
  trend: TrendCard,
  participation: ParticipationCard,
  masteryByTarget: MasteryByTargetCard,
  recentAssessments: RecentAssessmentsCard,
  goals: GoalsCard,
};
