// Newer-data check for the team's pinned hero, from the provider's assessment slices.

import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
} from '@/context/usePlcContext';
import type { ResolvedTeamLayout } from '@/utils/teamLayout';
import { selectNewerHeroData, type NewerHeroData } from './heroStaleness';

export function useNewerHeroData(
  layout: ResolvedTeamLayout
): NewerHeroData | null {
  const { data: aggregates } = usePlcAggregatesData();
  const { data: assessments } = usePlcAssessmentsData();
  const heroRef = layout.hero.mode === 'pinned' ? layout.hero.ref : undefined;
  return selectNewerHeroData(heroRef ?? null, aggregates, assessments);
}
