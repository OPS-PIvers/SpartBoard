// Hero renderers this slice owns (T5, T6, T19, T21) for the B1 hero dispatch.

import { createElement } from 'react';
import type { TeamHeroRef } from '@/types';
import { AssessmentHero, GoalHero, TargetHero } from './heroes';
import type { TeamHeroRenderer } from '@/components/plc/teams/types';

export const assessmentHero: TeamHeroRenderer = (props) =>
  createElement(AssessmentHero, props);
export const targetHero: TeamHeroRenderer = (props) =>
  createElement(TargetHero, props);
export const goalHero: TeamHeroRenderer = (props) =>
  createElement(GoalHero, props);
/** The PLC default rule (T6): follow the latest common assessment. */
export const latestAssessmentHero: TeamHeroRenderer = (props) =>
  createElement(AssessmentHero, { ...props, heroRef: null });

export const DATA_OVERVIEW_HEROES: Partial<
  Record<TeamHeroRef['kind'], TeamHeroRenderer>
> = {
  assessment: assessmentHero,
  target: targetHero,
  goal: goalHero,
};
