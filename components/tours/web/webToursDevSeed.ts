import type { GuidedLearningSet } from '@/types';
import type { PublishedTour } from '@/components/tours/tourSnapshot';
import type { TourRun } from '@/components/tours/tourRuns';
import type { TourCounts } from './useTourCounts';
import type { FreshArticle } from './freshserviceArticles';

/** Web tours page data the dummy backend can't reach, set by the `/web-tours-dev` harness. */
export interface WebToursDevSeed {
  tours: GuidedLearningSet[];
  published: Record<string, PublishedTour | null>;
  counts: Record<string, TourCounts>;
  runs: Record<string, TourRun[]>;
  articles?: Record<string, FreshArticle>;
}

declare global {
  interface Window {
    __webToursDevSeed?: WebToursDevSeed;
  }
}

/** Dev builds only; always null in production. */
export const webToursDevSeed = (): WebToursDevSeed | null =>
  import.meta.env.DEV && typeof window !== 'undefined'
    ? (window.__webToursDevSeed ?? null)
    : null;
